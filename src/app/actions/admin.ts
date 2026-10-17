"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, games, parlaySelectionLegs, parlays, picks, selections, slates, users } from "@/db/schema";
import type { AuthContext } from "@/lib/auth";
import { canManageRole, requireAdmin, revokeAllSessions } from "@/lib/auth";
import { fieldErrorsFrom, optionalNumber, settleSchema, unitsSchema, type ActionState } from "@/lib/validation";
import { isValidSlateDate, slateDateString } from "@/lib/slate-date";
import { freezeLine } from "@/lib/odds/board";
import { settleSelection, unsettleSelection } from "@/lib/odds/settle";
import {
  LEAGUE_CONFIG,
  eventLabel,
  lineLabel,
  marketCategory,
  marketEnum,
  type FeedLeague,
} from "@/lib/odds/markets";
import { formatOdds } from "@/lib/i18n/format";
import {
  CATEGORY_LABELS,
  CATEGORY_NOUN,
  MAX_UNITS,
  PICKS_PER_SLATE,
  isPickCategory,
  pickCategories,
  type PickCategory,
} from "@/lib/board";
import { z } from "zod";
import { violates } from "@/lib/db-errors";

async function audit(
  actor: AuthContext,
  action: string,
  entity: string,
  entityId?: string,
  meta?: Record<string, unknown>,
) {
  await db.insert(auditLog).values({
    actorId: actor.user.id,
    actorEmail: actor.user.email,
    action,
    entity,
    entityId: entityId ?? null,
    meta: meta ?? null,
  });
}

/**
 * Every surface a slate change is visible on. It takes no date because none of
 * these are per-date routes — the board and the admin screens all read the
 * slate from a query string or from today's date, so there is nothing to
 * interpolate.
 */
function revalidateSlate() {
  revalidatePath("/");
  revalidatePath("/picks");
  // The whole console: the sidebar's counts and the overview read these too.
  revalidatePath("/admin", "layout");
}

/* ------------------------------------------------------------ create pick */

const createPickSchema = z.object({
  slateDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  /** The feed line the pick is made from — everything about the bet comes off it. */
  lineId: z.string().uuid("Choose a line from the feed"),
  /** The price the admin was looking at; a moved price is refused, not taken. */
  expectedPrice: z.coerce.number().int(),
  units: unitsSchema(MAX_UNITS.game).default(1),
  confidence: optionalNumber(z.coerce.number().int().min(0).max(100)),
  evPct: optionalNumber(z.coerce.number().min(-100).max(100)),
  reasoning: z.string().trim().max(1000).optional().or(z.literal("")),
});

/**
 * Puts a pick on the board from a line in the odds feed.
 *
 * Nothing about the bet itself is typed any more — not the teams, not the
 * kick-off, not the selection, not the price. All of it is copied off the
 * feed line at this moment and frozen into a selection (lib/odds/board.ts),
 * which is also what gets graded. What the admin still supplies is the
 * opinion: the stake, the confidence, the edge and the write-up.
 */
export async function createPickAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireAdmin();

  const parsed = createPickSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the fields", fieldErrors: fieldErrorsFrom(parsed.error) };
  }
  const d = parsed.data;
  if (!isValidSlateDate(d.slateDate)) return { ok: false, error: "Bad slate date" };

  const frozen = await freezeLine(d.lineId, d.expectedPrice);
  if (!frozen.ok) {
    return {
      ok: false,
      error: frozen.movedTo !== undefined
        ? `The price moved to ${formatOdds(frozen.movedTo)} — check it and add again.`
        : frozen.error,
    };
  }
  const { game, line, selectionId } = frozen;

  // A pick belongs to the betting day its game is played on, whichever day's
  // board the admin happened to have open.
  if (slateDateString(game.commenceTime) !== d.slateDate) {
    return { ok: false, error: "That game is on a different day's slate." };
  }

  const category = marketCategory(line.marketKey);
  if (d.units > MAX_UNITS[category]) {
    return { ok: false, error: `A ${CATEGORY_NOUN[category]} is ${MAX_UNITS[category]} units at most.` };
  }
  const limit = PICKS_PER_SLATE[category];
  const league = game.league as FeedLeague;

  // Rank is never typed in — a new pick always lands on the lowest free rank
  // *within its own category* (filling a gap left by a deleted pick, or
  // appending after the last one). Reordering happens afterward by dragging
  // rows in the list. The two categories fill independently, so adding a prop
  // never shifts a game bet.
  let nextRank = 0;
  try {
    await db.transaction(async (tx) => {
      await tx
        .insert(slates)
        .values({ date: d.slateDate })
        .onConflictDoNothing({ target: slates.date });

      const [dupe] = await tx
        .select({ id: picks.id })
        .from(picks)
        .where(and(eq(picks.slateDate, d.slateDate), eq(picks.selectionId, selectionId)))
        .limit(1);
      if (dupe) throw new Error("Already on the board");

      const free = await tx.execute<{ rank: number | null }>(sql`
        select min(t.rank) as rank
        from generate_series(1, ${limit}) as t(rank)
        where not exists (
          select 1 from ${picks} p
          where p.slate_date = ${d.slateDate}
            and p.category = ${category}::pick_category
            and p.rank = t.rank
        )
      `);

      if (free[0]?.rank == null) {
        throw new Error(
          `Slate is full — ${limit} ${CATEGORY_NOUN[category]}s max`,
        );
      }
      nextRank = free[0].rank;

      await tx.insert(picks).values({
        slateDate: d.slateDate,
        category,
        rank: nextRank,
        sport: LEAGUE_CONFIG[league]?.sport ?? "football",
        league,
        event: eventLabel(game),
        startsAt: game.commenceTime,
        market: marketEnum(line.marketKey),
        selection: lineLabel(line),
        price: line.price,
        book: line.bookTitle,
        units: String(d.units),
        confidence: d.confidence ?? null,
        evPct: d.evPct !== undefined ? String(d.evPct) : null,
        reasoning: d.reasoning || null,
        selectionId,
      });
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Slate is full")) {
      return { ok: false, error: msg };
    }
    if (msg.includes("Already on the board")) {
      return { ok: false, error: "That exact bet is already on this day's board." };
    }
    if (violates(err, "picks_slate_rank_unique")) {
      return { ok: false, error: "Someone else just added a pick — try again." };
    }
    throw err;
  }

  await audit(actor, "pick.created", "pick", undefined, {
    slateDate: d.slateDate,
    category,
    rank: nextRank,
    selectionId,
    line: lineLabel(line),
    price: line.price,
    book: line.bookTitle,
  });
  revalidateSlate();
  return { ok: true, message: `${CATEGORY_LABELS[category]} — rank ${nextRank}: ${lineLabel(line)} ${formatOdds(line.price)}` };
}

/* ----------------------------------------------------------- reorder picks */

export async function reorderPicksAction(
  slateDate: string,
  category: PickCategory,
  orderedIds: string[],
): Promise<ActionState> {
  const actor = await requireAdmin();

  if (
    !isValidSlateDate(slateDate) ||
    !isPickCategory(category) ||
    orderedIds.some((id) => !z.string().uuid().safeParse(id).success)
  ) {
    return { ok: false, error: "Bad request" };
  }

  const [slate] = await db.select().from(slates).where(eq(slates.date, slateDate)).limit(1);
  if (slate?.publishedAt) {
    return { ok: false, error: "Slate is published — ranks are locked." };
  }

  // Scoped to the one category being dragged. Comparing against the whole day
  // would reject every reorder as incomplete once the other tab has rows in
  // it — and renumbering both lists from a single ordering would silently
  // rewrite the tab the admin isn't even looking at.
  const existing = await db
    .select({ id: picks.id })
    .from(picks)
    .where(and(eq(picks.slateDate, slateDate), eq(picks.category, category)));
  const existingIds = new Set(existing.map((r) => r.id));

  if (orderedIds.length !== existing.length || !orderedIds.every((id) => existingIds.has(id))) {
    return { ok: false, error: "Pick list is out of date — refresh and try again." };
  }

  // picks_slate_rank_unique is DEFERRABLE INITIALLY DEFERRED (see schema.ts),
  // so every row can be set to its final rank in one pass — Postgres only
  // checks uniqueness once, at commit, instead of after each row.
  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await tx
        .update(picks)
        .set({ rank: i + 1, updatedAt: new Date() })
        .where(eq(picks.id, orderedIds[i]));
    }
  });

  await audit(actor, "picks.reordered", "slate", slateDate, {
    category,
    count: orderedIds.length,
  });
  revalidateSlate();
  return { ok: true };
}

/* ---------------------------------------------------------- feature pick */

/**
 * Stars or unstars a pick: featured picks lead their day on the board. Any
 * number per day, and allowed after publishing — it's presentation, not the
 * record, so it doesn't fall under the published-is-immutable rule.
 */
export async function setPickFeaturedAction(pickId: string, featured: boolean): Promise<ActionState> {
  const actor = await requireAdmin();
  const id = z.string().uuid().safeParse(pickId);
  if (!id.success) return { ok: false, error: "Bad pick id" };

  const [row] = await db
    .update(picks)
    .set({ featured })
    .where(eq(picks.id, id.data))
    .returning({ id: picks.id });
  if (!row) return { ok: false, error: "Pick not found" };

  await audit(actor, featured ? "pick.featured" : "pick.unfeatured", "pick", id.data);
  revalidateSlate();
  return { ok: true, message: featured ? "Featured." : "No longer featured." };
}

/* ------------------------------------------------------------ delete pick */

export async function deletePickAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireAdmin();
  const id = z.string().uuid().safeParse(formData.get("pickId"));
  if (!id.success) return { ok: false, error: "Bad pick id" };

  const [existing] = await db.select().from(picks).where(eq(picks.id, id.data)).limit(1);
  if (!existing) return { ok: false, error: "Pick not found" };

  const [slate] = await db
    .select()
    .from(slates)
    .where(eq(slates.date, existing.slateDate))
    .limit(1);

  // Published picks are immutable (FR-P5). Removing one would rewrite history;
  // the correct action is a void, which stays visible on the record.
  if (slate?.publishedAt) {
    return { ok: false, error: "Slate is published — void the pick instead of deleting it." };
  }

  await db.delete(picks).where(eq(picks.id, id.data));
  await audit(actor, "pick.deleted", "pick", id.data, { rank: existing.rank });
  revalidateSlate();
  return { ok: true, message: "Pick removed." };
}

/* --------------------------------------------------------- publish slate */

/**
 * Oobee's parlays on a day, and how many of their feed legs have kicked off or
 * been graded. Their legs are frozen feed lines, not picks, so the picks
 * checks below don't see them — but a parlay is as public as a pick.
 */
async function parlayFacts(date: string): Promise<{ parlays: number; started: number; settled: number }> {
  const [r] = await db.execute<{ parlays: number; started: number; settled: number }>(sql`
    select count(distinct p.id)::int as parlays,
      count(*) filter (where g.commence_time <= now())::int as started,
      count(*) filter (where s.status <> 'pending')::int as settled
    from ${parlays} p
    left join ${parlaySelectionLegs} l on l.parlay_id = p.id
    left join ${selections} s on s.id = l.selection_id
    left join ${games} g on g.id = s.game_id
    where p.slate_date = ${date} and p.owner_id is null
  `);
  return r ?? { parlays: 0, started: 0, settled: 0 };
}

export async function publishSlateAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireAdmin();
  const date = String(formData.get("slateDate") ?? "");
  if (!isValidSlateDate(date)) return { ok: false, error: "Bad slate date" };

  const byCategory = await db
    .select({ category: picks.category, n: sql<number>`count(*)::int` })
    .from(picks)
    .where(eq(picks.slateDate, date))
    .groupBy(picks.category);

  const counts = Object.fromEntries(byCategory.map((r) => [r.category, r.n])) as Record<
    PickCategory,
    number | undefined
  >;
  const n = byCategory.reduce((total, r) => total + r.n, 0);
  const pf = await parlayFacts(date);

  if (n === 0 && pf.parlays === 0) return { ok: false, error: "Nothing to publish — add picks or a parlay first." };

  // A slate goes public before its games, never after. Otherwise a draft is a
  // way to pick winners in hindsight: add fifteen, wait for the results,
  // delete the losers, publish the rest. Started picks can still be deleted
  // from the draft (it was never public), and then the others can go out.
  const [{ late }] = await db
    .select({
      late: sql<number>`count(*) filter (where ${picks.startsAt} <= now() or ${picks.settledAt} is not null)::int`,
    })
    .from(picks)
    .where(eq(picks.slateDate, date));
  if (late > 0) {
    return {
      ok: false,
      error: `${late} pick${late === 1 ? " has" : "s have"} already started — delete ${late === 1 ? "it" : "them"} from the draft, then publish the rest.`,
    };
  }
  if (pf.started > 0 || pf.settled > 0) {
    return { ok: false, error: "A parlay has a leg that already started — delete it from the draft, then publish the rest." };
  }

  await db
    .update(slates)
    .set({ publishedAt: new Date(), publishedBy: actor.user.id })
    .where(and(eq(slates.date, date), sql`${slates.publishedAt} is null`));

  await audit(actor, "slate.published", "slate", date, {
    pickCount: n,
    ...Object.fromEntries(byCategory.map((r) => [`${r.category}Count`, r.n])),
  });
  revalidateSlate();

  // Both tabs go live together, so the confirmation names both — "15 picks
  // live" no longer says which board got them.
  const breakdown = [
    ...pickCategories.map((c) => `${counts[c] ?? 0} ${CATEGORY_NOUN[c]}${counts[c] === 1 ? "" : "s"}`),
    ...(pf.parlays > 0 ? [`${pf.parlays} parlay${pf.parlays === 1 ? "" : "s"}`] : []),
  ].join(", ");
  return { ok: true, message: `Slate published — ${breakdown} live.` };
}

export async function unpublishSlateAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireAdmin();
  const date = String(formData.get("slateDate") ?? "");
  if (!isValidSlateDate(date)) return { ok: false, error: "Bad slate date" };

  const [{ settled, started }] = await db
    .select({
      settled: sql<number>`count(*) filter (where ${picks.settledAt} is not null)::int`,
      started: sql<number>`count(*) filter (where ${picks.startsAt} <= now())::int`,
    })
    .from(picks)
    .where(eq(picks.slateDate, date));
  const pf = await parlayFacts(date);

  // Once results are on the public record, pulling the slate would be editing
  // history after the fact.
  if (settled > 0 || pf.settled > 0) {
    return { ok: false, error: "Picks are already settled — this slate is part of the record." };
  }
  // So would pulling it once a game is under way: a draft's picks can be
  // deleted, so this was the way to make a pick that's going badly vanish
  // before anyone settled it. From the first kick-off, void instead.
  if (started > 0 || pf.started > 0) {
    return {
      ok: false,
      error: "A game on this slate has started — it's part of the record now. Void a pick instead.",
    };
  }

  await db.update(slates).set({ publishedAt: null, publishedBy: null }).where(eq(slates.date, date));
  await audit(actor, "slate.unpublished", "slate", date);
  revalidateSlate();
  return { ok: true, message: "Slate pulled back to draft." };
}

/* --------------------------------------------------------------- settle */

export async function settlePickAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireAdmin();

  const parsed = settleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: "Check the fields", fieldErrors: fieldErrorsFrom(parsed.error) };
  }
  const { pickId, status, finalScore, voidReason } = parsed.data;

  if (status === "void" && !voidReason) {
    return { ok: false, error: "A void needs a reason — it goes in the audit log." };
  }

  const [existing] = await db.select().from(picks).where(eq(picks.id, pickId)).limit(1);
  if (!existing) return { ok: false, error: "Pick not found" };

  // A feed-backed pick is settled through its selection, which writes this
  // pick and every community leg on the same bet in one go — settling the
  // pick alone would leave the two disagreeing about one result.
  if (existing.selectionId) {
    await settleSelection(
      existing.selectionId,
      { status, finalScore: finalScore || null, voidReason: voidReason || null },
      { id: actor.user.id, email: actor.user.email },
    );
    revalidateSlate();
    return { ok: true, message: `Settled as ${status}.` };
  }

  await db
    .update(picks)
    .set({
      status,
      finalScore: finalScore || null,
      voidReason: voidReason || null,
      settledAt: new Date(),
      settledBy: actor.user.id,
      updatedAt: new Date(),
    })
    .where(eq(picks.id, pickId));

  await audit(actor, `pick.settled.${status}`, "pick", pickId, {
    from: existing.status,
    to: status,
    finalScore,
    voidReason,
  });

  revalidateSlate();
  return { ok: true, message: `Settled as ${status}.` };
}

export async function unsettlePickAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireAdmin();
  const id = z.string().uuid().safeParse(formData.get("pickId"));
  if (!id.success) return { ok: false, error: "Bad pick id" };

  const [existing] = await db.select().from(picks).where(eq(picks.id, id.data)).limit(1);
  if (!existing) return { ok: false, error: "Pick not found" };

  if (existing.selectionId) {
    await unsettleSelection(existing.selectionId, { id: actor.user.id, email: actor.user.email });
    revalidateSlate();
    return { ok: true, message: "Reset to pending." };
  }

  await db
    .update(picks)
    .set({ status: "pending", finalScore: null, settledAt: null, settledBy: null, voidReason: null })
    .where(eq(picks.id, id.data));

  // Correcting a mis-settle is legitimate, but it changes published numbers,
  // so it is logged loudly rather than silently allowed.
  await audit(actor, "pick.unsettled", "pick", id.data, { was: existing.status });
  revalidateSlate();
  return { ok: true, message: "Reset to pending." };
}

/* ---------------------------------------------------------------- users */

export async function setUserRoleAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireAdmin();

  const parsed = z
    .object({
      userId: z.string().uuid(),
      role: z.enum(["user", "admin"]),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Bad request" };

  const [target] = await db
    .select()
    .from(users)
    .where(eq(users.id, parsed.data.userId))
    .limit(1);
  if (!target) return { ok: false, error: "User not found" };

  if (!canManageRole(actor, target)) {
    return { ok: false, error: "You can't change your own role." };
  }

  // Never let the last admin be demoted — that locks everyone out of the panel
  // permanently, with no recovery path short of a SQL console. Admins being
  // plural makes this less likely to come up, not less important: the check is
  // the only thing standing between "we have two admins" and nobody at all.
  if (target.role === "admin" && parsed.data.role !== "admin") {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(users)
      .where(eq(users.role, "admin"));
    if (n <= 1) return { ok: false, error: "There must be at least one admin." };
  }

  await db
    .update(users)
    .set({ role: parsed.data.role, updatedAt: new Date() })
    .where(eq(users.id, target.id));

  // A demoted admin must lose admin pages immediately, not at session expiry.
  if (target.role === "admin" && parsed.data.role === "user") {
    await revokeAllSessions(target.id);
  }

  await audit(actor, "user.role_changed", "user", target.id, {
    from: target.role,
    to: parsed.data.role,
    email: target.email,
  });

  revalidatePath("/admin/users", "layout");
  return { ok: true, message: `${target.email} is now ${parsed.data.role}.` };
}


/* ----------------------------------------------- community legs (selections) */

/**
 * Settles a selection no Oobee pick points at — a community-parlay leg. Game
 * lines grade themselves from the final score; this is for player props,
 * which the feed cannot grade, and for corrections (a postponed game voids).
 */
export async function settleSelectionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireAdmin();
  const parsed = z
    .object({
      selectionId: z.string().uuid(),
      status: z.enum(["won", "lost", "push", "void"]),
      finalScore: z.string().trim().max(60).optional().or(z.literal("")),
      voidReason: z.string().trim().max(300).optional().or(z.literal("")),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Check the fields" };
  const { selectionId, status, finalScore, voidReason } = parsed.data;
  if (status === "void" && !voidReason) {
    return { ok: false, error: "A void needs a reason — it goes in the audit log." };
  }
  await settleSelection(
    selectionId,
    { status, finalScore: finalScore || null, voidReason: voidReason || null },
    { id: actor.user.id, email: actor.user.email },
  );
  revalidateSlate();
  revalidatePath("/stats");
  return { ok: true, message: `Settled as ${status}.` };
}

export async function unsettleSelectionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireAdmin();
  const id = z.string().uuid().safeParse(formData.get("selectionId"));
  if (!id.success) return { ok: false, error: "Bad selection id" };
  await unsettleSelection(id.data, { id: actor.user.id, email: actor.user.email });
  revalidateSlate();
  revalidatePath("/stats");
  return { ok: true, message: "Reset to pending." };
}
