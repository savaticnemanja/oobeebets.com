"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, picks, slates, users } from "@/db/schema";
import type { AuthContext } from "@/lib/auth";
import { canManageRole, requireAdmin, revokeAllSessions } from "@/lib/auth";
import {
  fieldErrorsFrom,
  LEAGUE_SPORT,
  pickSchema,
  settleSchema,
  type ActionState,
} from "@/lib/validation";
import { isValidSlateDate, zonedTimeToUtc } from "@/lib/slate-date";
import {
  CATEGORY_LABELS,
  CATEGORY_NOUN,
  PICKS_PER_SLATE,
  isPickCategory,
  pickCategories,
  type PickCategory,
} from "@/lib/board";
import { z } from "zod";

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
  revalidatePath("/top-picks");
  revalidatePath("/admin/slate");
  revalidatePath("/admin/settle");
}

/* ------------------------------------------------------------ create pick */

export async function createPickAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireAdmin();

  const parsed = pickSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: "Check the fields", fieldErrors: fieldErrorsFrom(parsed.error) };
  }
  const d = parsed.data;

  const startsAt = zonedTimeToUtc(d.startsAt);
  if (Number.isNaN(startsAt.getTime())) {
    return { ok: false, error: "Invalid kick-off time", fieldErrors: { startsAt: ["Invalid date"] } };
  }

  // A player prop is always market "prop" — derived here rather than trusted
  // from the form, for the same reason sport is derived from league: one less
  // pair of fields a forged request can put out of step.
  const market = d.category === "prop" ? "prop" : d.market;
  const limit = PICKS_PER_SLATE[d.category];

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

      const free = await tx.execute<{ rank: number | null }>(sql`
        select min(t.rank) as rank
        from generate_series(1, ${limit}) as t(rank)
        where not exists (
          select 1 from ${picks} p
          where p.slate_date = ${d.slateDate}
            and p.category = ${d.category}::pick_category
            and p.rank = t.rank
        )
      `);

      if (free[0]?.rank == null) {
        throw new Error(
          `Slate is full — ${limit} ${CATEGORY_NOUN[d.category]}s max`,
        );
      }
      nextRank = free[0].rank;

      await tx.insert(picks).values({
        slateDate: d.slateDate,
        category: d.category,
        rank: nextRank,
        sport: LEAGUE_SPORT[d.league],
        league: d.league,
        event: `${d.awayTeam} vs ${d.homeTeam}`,
        startsAt,
        market,
        selection: d.selection,
        price: d.price,
        book: d.book || null,
        units: String(d.units),
        confidence: d.confidence ?? null,
        evPct: d.evPct !== undefined ? String(d.evPct) : null,
        reasoning: d.reasoning || null,
      });
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Slate is full")) {
      return { ok: false, error: msg };
    }
    if (msg.includes("picks_slate_rank_unique")) {
      return { ok: false, error: "Someone else just added a pick — try again." };
    }
    throw err;
  }

  await audit(actor, "pick.created", "pick", undefined, {
    slateDate: d.slateDate,
    category: d.category,
    rank: nextRank,
  });
  revalidateSlate();
  return { ok: true, message: `${CATEGORY_LABELS[d.category]} — rank ${nextRank} added.` };
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

  if (n === 0) return { ok: false, error: "Nothing to publish — add picks first." };

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
  const breakdown = pickCategories
    .map((c) => `${counts[c] ?? 0} ${CATEGORY_NOUN[c]}${counts[c] === 1 ? "" : "s"}`)
    .join(", ");
  return { ok: true, message: `Slate published — ${breakdown} live.` };
}

export async function unpublishSlateAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireAdmin();
  const date = String(formData.get("slateDate") ?? "");
  if (!isValidSlateDate(date)) return { ok: false, error: "Bad slate date" };

  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(picks)
    .where(and(eq(picks.slateDate, date), sql`${picks.settledAt} is not null`));

  // Once results are on the public record, pulling the slate would be editing
  // history after the fact.
  if (n > 0) {
    return { ok: false, error: "Picks are already settled — this slate is part of the record." };
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

  revalidatePath("/admin/users");
  return { ok: true, message: `${target.email} is now ${parsed.data.role}.` };
}

