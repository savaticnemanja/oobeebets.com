import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, games, picks, selections } from "@/db/schema";
import type { PickStatus } from "@/db/schema";
import { GAME_MARKETS, finalScoreLabel, gradeLine } from "./markets";

/**
 * Settling feed-backed bets. A selection's result is written here and copied
 * onto every Oobee pick made from it in the same transaction, so the pick
 * table — which the track record, the follow analytics and the board all read
 * — can never disagree with the selection it came from.
 */

export interface Settlement {
  status: Exclude<PickStatus, "pending">;
  finalScore?: string | null;
  voidReason?: string | null;
}

/** `actor` null is the automatic grader. */
export async function settleSelection(
  selectionId: string,
  s: Settlement,
  actor: { id: string; email: string } | null,
): Promise<void> {
  const now = new Date();
  const values = {
    status: s.status,
    finalScore: s.finalScore ?? null,
    voidReason: s.voidReason ?? null,
    settledAt: now,
    settledBy: actor?.id ?? null,
  };
  await db.transaction(async (tx) => {
    // The grader only ever moves a pending bet: two page loads grading at the
    // same moment must not both settle it (and log it) — the second finds
    // nothing pending and stops. An admin may re-settle on purpose.
    const updated = await tx
      .update(selections)
      .set(values)
      .where(
        actor
          ? eq(selections.id, selectionId)
          : and(eq(selections.id, selectionId), eq(selections.status, "pending")),
      )
      .returning({ id: selections.id });
    if (updated.length === 0) return;
    await tx
      .update(picks)
      .set({ ...values, updatedAt: now })
      .where(eq(picks.selectionId, selectionId));
    await tx.insert(auditLog).values({
      actorId: actor?.id ?? null,
      actorEmail: actor?.email ?? "grader",
      action: `selection.settled.${s.status}${actor ? "" : ".auto"}`,
      entity: "selection",
      entityId: selectionId,
      meta: { finalScore: values.finalScore, voidReason: values.voidReason },
    });
  });
}

/** Back to pending — a correction, and logged as one. */
export async function unsettleSelection(
  selectionId: string,
  actor: { id: string; email: string },
): Promise<void> {
  const reset = { status: "pending" as const, finalScore: null, voidReason: null, settledAt: null, settledBy: null };
  await db.transaction(async (tx) => {
    await tx.update(selections).set(reset).where(eq(selections.id, selectionId));
    await tx.update(picks).set({ ...reset, updatedAt: new Date() }).where(eq(picks.selectionId, selectionId));
    await tx.insert(auditLog).values({
      actorId: actor.id,
      actorEmail: actor.email,
      action: "selection.unsettled",
      entity: "selection",
      entityId: selectionId,
    });
  });
}

/**
 * Grades every pending game-market selection whose game the feed reports as
 * final. Player props are left alone — see gradeLine.
 */
export async function autoSettle(): Promise<number> {
  const due = await db
    .select({
      id: selections.id,
      marketKey: selections.marketKey,
      outcome: selections.outcome,
      player: selections.player,
      point: selections.point,
      homeTeam: games.homeTeam,
      awayTeam: games.awayTeam,
      homeScore: games.homeScore,
      awayScore: games.awayScore,
    })
    .from(selections)
    .innerJoin(games, eq(games.id, selections.gameId))
    .where(
      and(
        eq(selections.status, "pending"),
        eq(games.completed, true),
        inArray(selections.marketKey, [...GAME_MARKETS]),
      ),
    );

  let settled = 0;
  for (const d of due) {
    if (d.homeScore === null || d.awayScore === null) continue;
    const result = { homeTeam: d.homeTeam, awayTeam: d.awayTeam, homeScore: d.homeScore, awayScore: d.awayScore };
    const status = gradeLine(d, result);
    if (!status || status === "pending") continue;
    await settleSelection(d.id, { status, finalScore: finalScoreLabel(result) }, null);
    settled++;
  }
  return settled;
}
