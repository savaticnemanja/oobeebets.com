"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  auditLog,
  games,
  parlayLegs,
  parlaySelectionLegs,
  parlays,
  picks,
  posts,
  selections,
  slates,
} from "@/db/schema";
import { freezeLine } from "@/lib/odds/board";
import { formatOdds } from "@/lib/i18n/format";
import type { AuthContext } from "@/lib/auth";
import { getAuth, requireAdmin } from "@/lib/auth";
import {
  MAX_PARLAY_LEGS,
  MIN_PARLAY_LEGS,
  parlayWindowOpen,
} from "@/lib/parlays";
import { PARLAYS_PER_SLATE } from "@/lib/board";
import { isValidSlateDate, slateDateString } from "@/lib/slate-date";
import { fieldErrorsFrom, type ActionState } from "@/lib/validation";
import { violates } from "@/lib/db-errors";

/**
 * Building and tearing down parlays — Oobee's own, and the ones testers make
 * from the board.
 *
 * Both paths run the same leg validation, because the rule they enforce is the
 * same rule: a parlay may only ever contain picks that were published and
 * still unplayed at the moment it was built. Everything downstream — the live
 * price, the grade, the tester's record — is only trustworthy because that is
 * checked here rather than in the form that submitted it.
 */

const legIdsSchema = z
  .array(z.string().uuid())
  .min(MIN_PARLAY_LEGS, `A parlay needs at least ${MIN_PARLAY_LEGS} legs`)
  .max(MAX_PARLAY_LEGS, `A parlay tops out at ${MAX_PARLAY_LEGS} legs`)
  // A pick twice in one parlay would square its odds and invent money no book
  // would pay. The primary key refuses it too; this is the readable error.
  .refine((ids) => new Set(ids).size === ids.length, "A pick can only be in a parlay once");

interface ValidatedLegs {
  slateDate: string;
  ids: string[];
}

/**
 * The gate every parlay passes through.
 *
 * Re-reads each leg from the database rather than trusting anything the form
 * sent: the client's list of selectable picks is a suggestion, and a forged
 * request can name any uuid it likes.
 */
async function validateLegs(
  ids: string[],
): Promise<{ ok: true; legs: ValidatedLegs } | { ok: false; error: string }> {
  const rows = await db
    .select({
      id: picks.id,
      slateDate: picks.slateDate,
      startsAt: picks.startsAt,
      status: picks.status,
      publishedAt: slates.publishedAt,
    })
    .from(picks)
    .innerJoin(slates, eq(slates.date, picks.slateDate))
    .where(inArray(picks.id, ids));

  if (rows.length !== ids.length) {
    return { ok: false, error: "One of those picks no longer exists." };
  }
  // Built on the draft and published with it, so legs come off an
  // unpublished slate; the action itself refuses once the slate is out.
  if (rows.some((r) => r.status !== "pending")) {
    return { ok: false, error: "A parlay can only use picks that are still pending." };
  }

  // One slate per parlay. The row carries a single slate_date, and a ticket
  // spanning two betting days would belong to neither board — it is also not
  // something the builder can produce, since it only ever shows one day.
  const dates = new Set(rows.map((r) => r.slateDate));
  if (dates.size > 1) {
    return { ok: false, error: "Every leg has to come from the same day's board." };
  }

  // The earliest leg closes the ticket. Checked against the legs as a set,
  // not one at a time, which is the point — see parlayWindowOpen.
  if (!parlayWindowOpen(rows)) {
    return { ok: false, error: "One of those games has already started." };
  }

  return { ok: true, legs: { slateDate: [...dates][0], ids } };
}

/* ------------------------------------------------------- a tester's parlay */

const communityLegsSchema = z
  .array(z.object({ lineId: z.string().uuid(), price: z.number().int() }))
  .min(MIN_PARLAY_LEGS, `A parlay needs at least ${MIN_PARLAY_LEGS} legs`)
  .max(MAX_PARLAY_LEGS, `A parlay tops out at ${MAX_PARLAY_LEGS} legs`)
  .refine((ls) => new Set(ls.map((l) => l.lineId)).size === ls.length, "A line can only be in a parlay once");

export type CommunityParlayResult =
  | { ok: true; message: string }
  | { ok: false; error: string; movedLineId?: string };

/**
 * A tester builds a parlay from any line in the odds feed — the Community
 * parlays tab.
 *
 * Each leg is frozen into a selection at the price the tester saw (see
 * freezeLine); if any price has moved the whole ticket is refused and the
 * builder refreshes, rather than saving a parlay at odds nobody chose.
 *
 * One leg per game. A book prices legs from the same game together, at worse
 * than the product of their odds (they are correlated), so a same-game ticket
 * priced the naive way would show a payout no book would honour.
 *
 * Note what this deliberately does *not* do: it does not mark anything as
 * followed. A parlay is one bet, not several singles.
 */
export async function createCommunityParlayAction(
  legs: Array<{ lineId: string; price: number }>,
  shared: boolean,
): Promise<CommunityParlayResult> {
  const auth = await getAuth();
  if (!auth) {
    return { ok: false, error: "Your session expired — sign in again to build this." };
  }

  const parsed = communityLegsSchema.safeParse(legs);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Bad request" };
  }

  const frozen: Array<{ selectionId: string; gameId: string; slateDate: string }> = [];
  for (const leg of parsed.data) {
    const f = await freezeLine(leg.lineId, leg.price);
    if (!f.ok) {
      return {
        ok: false,
        error:
          f.movedTo !== undefined
            ? `A price moved (now ${formatOdds(f.movedTo)}) — the slip has been refreshed, check it and save again.`
            : f.error,
        movedLineId: leg.lineId,
      };
    }
    frozen.push({ selectionId: f.selectionId, gameId: f.gameId, slateDate: slateDateString(f.game.commenceTime) });
  }

  if (new Set(frozen.map((f) => f.gameId)).size !== frozen.length) {
    return { ok: false, error: "One leg per game — same-game legs are priced differently by the books." };
  }
  // Legs can be on different days — a Thursday game and Sunday's, as an NFL
  // week is played. The ticket files under its first leg's day, which is
  // also when it locks.
  const slateDate = frozen.map((f) => f.slateDate).sort()[0];

  await db.transaction(async (tx) => {
    // The day may have no Oobee slate yet; the row is only the date key the
    // parlay hangs off, and creating it publishes nothing.
    await tx.insert(slates).values({ date: slateDate }).onConflictDoNothing({ target: slates.date });
    const [row] = await tx
      .insert(parlays)
      .values({ ownerId: auth.user.id, slateDate, shared: Boolean(shared) })
      .returning({ id: parlays.id });
    await tx
      .insert(parlaySelectionLegs)
      .values(frozen.map((f) => ({ parlayId: row.id, selectionId: f.selectionId })));
    // Shared, it is a post too — see setParlaySharedAction.
    if (shared) await tx.insert(posts).values({ authorId: auth.user.id, body: "", parlayId: row.id });
  });

  revalidatePath("/picks");
  revalidatePath("/community");
  revalidatePath("/stats");
  revalidatePath("/home");
  return {
    ok: true,
    message: `${frozen.length}-leg parlay saved${shared ? " and shared to Community" : ""}.`,
  };
}

/**
 * The legs of one of the viewer's own parlays — kick-off and status, which is
 * what the window needs — or null when it isn't theirs. Ownership is part of
 * the where clause, not a check after the fact: this cannot read, and
 * therefore cannot leak, somebody else's ticket.
 */
async function ownParlayLegs(parlayId: string, ownerId: string) {
  const [owned] = await db
    .select({ id: parlays.id })
    .from(parlays)
    .where(and(eq(parlays.id, parlayId), eq(parlays.ownerId, ownerId)))
    .limit(1);
  if (!owned) return null;

  const [pickLegs, selectionLegs] = await Promise.all([
    db
      .select({ startsAt: picks.startsAt, status: picks.status })
      .from(parlayLegs)
      .innerJoin(picks, eq(picks.id, parlayLegs.pickId))
      .where(eq(parlayLegs.parlayId, parlayId)),
    db
      .select({ startsAt: games.commenceTime, status: selections.status })
      .from(parlaySelectionLegs)
      .innerJoin(selections, eq(selections.id, parlaySelectionLegs.selectionId))
      .innerJoin(games, eq(games.id, selections.gameId))
      .where(eq(parlaySelectionLegs.parlayId, parlayId)),
  ]);
  return [...pickLegs, ...selectionLegs];
}

/** Flip a tester's own parlay between shared and private. */
export async function setParlaySharedAction(parlayId: string, shared: boolean): Promise<ActionState> {
  const auth = await getAuth();
  if (!auth) return { ok: false, error: "Your session expired — sign in again." };
  if (!z.string().uuid().safeParse(parlayId).success) return { ok: false, error: "Bad request" };
  const legs = await ownParlayLegs(parlayId, auth.user.id);
  if (!legs) return { ok: false, error: "Parlay not found" };
  // Shared or private is settled at the first kick-off, as the ticket itself
  // is. Otherwise Community is a highlight reel: share the ones that came in
  // (they even land in For you as new), quietly take back the ones that lost.
  if (!parlayWindowOpen(legs)) {
    return { ok: false, error: "This one is locked in — a leg has already started." };
  }
  // The post that carries a shared parlay comes and goes with sharing: on
  // Community and in timelines it is that post — liked, replied to, reposted
  // — so a private parlay has none. Unsharing takes its replies with it,
  // which the switch asks about first.
  const done = await db.transaction(async (tx) => {
    const updated = await tx
      .update(parlays)
      .set({ shared: Boolean(shared), updatedAt: new Date() })
      .where(and(eq(parlays.id, parlayId), eq(parlays.ownerId, auth.user.id)))
      .returning({ id: parlays.id });
    if (updated.length === 0) return false;
    if (shared) {
      await tx
        .insert(posts)
        .values({ authorId: auth.user.id, body: "", parlayId })
        .onConflictDoNothing({ target: posts.parlayId });
    } else {
      await tx.delete(posts).where(eq(posts.parlayId, parlayId));
    }
    return true;
  });
  if (!done) return { ok: false, error: "Parlay not found" };
  revalidatePath("/picks");
  revalidatePath("/community");
  revalidatePath("/stats");
  revalidatePath("/home");
  revalidatePath(`/u/${auth.user.username}`, "layout");
  return { ok: true, message: shared ? "Shared to Community." : "Made private." };
}

/**
 * A tester removes their own parlay, while every leg is still ahead of
 * kick-off.
 *
 * The window is the same one that governs building, and it closes for the same
 * reason: once a game is under way, deleting the ticket would be editing a
 * record whose outcome is becoming known. The legs cascade with the row.
 */
export async function deleteUserParlayAction(parlayId: string): Promise<ActionState> {
  const auth = await getAuth();
  if (!auth) return { ok: false, error: "Your session expired — sign in again." };

  if (!z.string().uuid().safeParse(parlayId).success) {
    return { ok: false, error: "Bad request" };
  }

  const legs = await ownParlayLegs(parlayId, auth.user.id);
  if (!legs) return { ok: false, error: "Parlay not found" };

  if (!parlayWindowOpen(legs)) {
    return { ok: false, error: "This one is locked in — a leg has already started." };
  }

  await db.delete(parlays).where(eq(parlays.id, parlayId));

  revalidatePath("/picks");
  revalidatePath("/community");
  revalidatePath("/stats");
  return { ok: true, message: "Parlay removed." };
}

/* --------------------------------------------------------- Oobee's parlay */

const oobeeParlaySchema = z.object({
  slateDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  title: z.string().trim().max(80).optional().or(z.literal("")),
  /** Blank derives the price from the legs; a value records the book's own. */
  price: z
    .union([z.literal(""), z.coerce.number().int()])
    .optional()
    .refine(
      (n) => n === "" || n === undefined || n >= 100 || n <= -100,
      "American odds: >= +100 or <= -100",
    ),
  units: z.coerce.number().min(0.1).max(10).default(1),
  confidence: z.coerce.number().int().min(0).max(100).optional(),
  evPct: z.coerce.number().min(-100).max(100).optional(),
  reasoning: z.string().trim().max(1000).optional().or(z.literal("")),
  book: z.string().trim().max(60).optional().or(z.literal("")),
});

async function audit(
  actor: AuthContext,
  action: string,
  entityId: string,
  meta?: Record<string, unknown>,
) {
  await db.insert(auditLog).values({
    actorId: actor.user.id,
    actorEmail: actor.user.email,
    action,
    entity: "parlay",
    entityId,
    meta: meta ?? null,
  });
}

function revalidateBoard() {
  revalidatePath("/picks");
  revalidatePath("/community");
  revalidatePath("/admin/slate");
  revalidatePath("/admin/parlays");
}

/**
 * Oobee publishes a parlay onto its own board tab.
 *
 * Ranked like the other two boards, and on the same "lowest free rank" rule as
 * createPickAction — rank is never typed in, so two admins adding at once
 * cannot both claim rank 1.
 */
export async function createOobeeParlayAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireAdmin();

  const legIds = formData.getAll("legIds").map(String);
  const legs = legIdsSchema.safeParse(legIds);
  if (!legs.success) {
    return { ok: false, error: legs.error.issues[0]?.message ?? "Pick the legs first" };
  }

  const parsed = oobeeParlaySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: "Check the fields", fieldErrors: fieldErrorsFrom(parsed.error) };
  }
  const d = parsed.data;
  if (!isValidSlateDate(d.slateDate)) return { ok: false, error: "Bad slate date" };

  const checked = await validateLegs(legs.data);
  if (!checked.ok) return { ok: false, error: checked.error };
  if (checked.legs.slateDate !== d.slateDate) {
    return { ok: false, error: "Those legs are not on that day's board." };
  }
  const [slate] = await db
    .select({ publishedAt: slates.publishedAt })
    .from(slates)
    .where(eq(slates.date, d.slateDate))
    .limit(1);
  if (slate?.publishedAt) {
    return { ok: false, error: "That slate is published — unpublish it to add a parlay." };
  }

  let rank = 0;
  try {
    const id = await db.transaction(async (tx) => {
      const free = await tx.execute<{ rank: number | null }>(sql`
        select min(t.rank) as rank
        from generate_series(1, ${PARLAYS_PER_SLATE}) as t(rank)
        where not exists (
          select 1 from ${parlays} p
          where p.slate_date = ${d.slateDate}
            and p.owner_id is null
            and p.rank = t.rank
        )
      `);
      if (free[0]?.rank == null) {
        throw new Error(`Parlay board is full — ${PARLAYS_PER_SLATE} max`);
      }
      rank = free[0].rank;

      const [row] = await tx
        .insert(parlays)
        .values({
          ownerId: null,
          slateDate: d.slateDate,
          rank,
          title: d.title || null,
          price: d.price === "" || d.price === undefined ? null : d.price,
          units: String(d.units),
          confidence: d.confidence ?? null,
          evPct: d.evPct !== undefined ? String(d.evPct) : null,
          reasoning: d.reasoning || null,
          book: d.book || null,
        })
        .returning({ id: parlays.id });

      await tx
        .insert(parlayLegs)
        .values(checked.legs.ids.map((pickId) => ({ parlayId: row.id, pickId })));
      return row.id;
    });

    await audit(actor, "parlay.created", id, {
      slateDate: d.slateDate,
      rank,
      legs: checked.legs.ids.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Parlay board is full")) return { ok: false, error: msg };
    if (violates(err, "parlays_oobee_rank_unique")) {
      return { ok: false, error: "Someone else just added a parlay — try again." };
    }
    throw err;
  }

  revalidateBoard();
  return { ok: true, message: `Parlay added at rank ${rank}.` };
}

/**
 * Removes one of Oobee's parlays, draft only.
 *
 * Published parlays are immutable for the same reason published picks are:
 * deleting one after it has been seen rewrites the record. There is no "void a
 * parlay" counterpart because a parlay cannot be voided on its own — voiding
 * its legs on /admin/settle is what empties it, and the grade follows.
 */
/** Stars or unstars one of Oobee's parlays — see setPickFeaturedAction. */
export async function setOobeeParlayFeaturedAction(
  parlayId: string,
  featured: boolean,
): Promise<ActionState> {
  const actor = await requireAdmin();
  const id = z.string().uuid().safeParse(parlayId);
  if (!id.success) return { ok: false, error: "Bad parlay id" };

  const [row] = await db
    .update(parlays)
    .set({ featured })
    .where(and(eq(parlays.id, id.data), isNull(parlays.ownerId)))
    .returning({ id: parlays.id });
  if (!row) return { ok: false, error: "Parlay not found" };

  await audit(actor, featured ? "parlay.featured" : "parlay.unfeatured", id.data);
  revalidateBoard();
  return { ok: true, message: featured ? "Featured." : "No longer featured." };
}

export async function deleteOobeeParlayAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireAdmin();
  const id = z.string().uuid().safeParse(formData.get("parlayId"));
  if (!id.success) return { ok: false, error: "Bad parlay id" };

  const [existing] = await db
    .select({ slateDate: parlays.slateDate, rank: parlays.rank, ownerId: parlays.ownerId })
    .from(parlays)
    .where(eq(parlays.id, id.data))
    .limit(1);

  if (!existing) return { ok: false, error: "Parlay not found" };
  if (existing.ownerId !== null) {
    return { ok: false, error: "That is a tester's parlay, not one of ours." };
  }

  const [slate] = await db
    .select({ publishedAt: slates.publishedAt })
    .from(slates)
    .where(eq(slates.date, existing.slateDate))
    .limit(1);

  if (slate?.publishedAt) {
    return { ok: false, error: "Slate is published — settle the legs instead of deleting." };
  }

  await db.delete(parlays).where(eq(parlays.id, id.data));
  await audit(actor, "parlay.deleted", id.data, { rank: existing.rank });
  revalidateBoard();
  return { ok: true, message: "Parlay removed." };
}
