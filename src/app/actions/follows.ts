"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { parlayFollows, parlays, pickFollows, picks, slates } from "@/db/schema";
import { getParlaysByIds } from "@/lib/parlay-store";
import { getAuth } from "@/lib/auth";
import { followWindowOpen } from "@/lib/follows";
import { notify, unnotify } from "@/lib/notifications";
import { BLOCKED, canInteract } from "@/lib/moderation";
import { viewerAccess } from "@/lib/billing/access";
import type { ActionState } from "@/lib/validation";

/**
 * Records — or withdraws — "I took this bet" for the signed-in viewer.
 *
 * Takes the state the viewer wants rather than flipping whatever is stored, so
 * it is idempotent: a double tap, or two tabs open on the same board, settle on
 * the state of the last click instead of racing each other back and forth.
 *
 * No rate limit, unlike the auth actions. This one needs a live session, and
 * the primary key caps what any amount of tapping can produce at one row per
 * pick — there is no volume to limit, and a limiter would add a write to the
 * hottest path on the board.
 */
export async function setPickFollowAction(
  pickId: string,
  taken: boolean,
): Promise<ActionState> {
  // getAuth, not requireAuth: the admin actions throw here because a request
  // without a session has no business reaching them at all, but this control
  // sits on a page a tester may leave open for hours, and a session that
  // lapsed in the meantime is ordinary. Thrown, it is a 500 the circle cannot
  // explain — returned, it is a sentence in a toast.
  const auth = await getAuth();
  if (!auth) {
    return { ok: false, error: "Your session expired — sign in again to log this." };
  }

  const parsed = z
    .object({ pickId: z.string().uuid(), taken: z.boolean() })
    .safeParse({ pickId, taken });
  if (!parsed.success) return { ok: false, error: "Bad request" };

  // One read for the three things that decide whether this is allowed. The
  // join is an inner one because a pick without a slate cannot exist — slate_date
  // is a NOT NULL foreign key.
  const [pick] = await db
    .select({
      startsAt: picks.startsAt,
      status: picks.status,
      publishedAt: slates.publishedAt,
      rank: picks.rank,
      category: picks.category,
    })
    .from(picks)
    .innerJoin(slates, eq(slates.date, picks.slateDate))
    .where(eq(picks.id, parsed.data.pickId))
    .limit(1);

  if (!pick) return { ok: false, error: "Pick not found" };

  // The board never sends a pick past the viewer's plan, but a request can
  // name any id: the plan is checked here too.
  const { rule } = await viewerAccess(auth);
  if (!auth.isAdmin && pick.rank > rule.picks[pick.category]) {
    return { ok: false, error: "That pick isn't on your plan." };
  }

  // Admins preview draft slates, and the cards there render without a control
  // — but the action is reachable directly, and a follow on a pick nobody else
  // can see yet is not a datapoint. Checked server-side, not just hidden.
  if (!pick.publishedAt) {
    return { ok: false, error: "That pick isn't live yet." };
  }

  // The window closes at kick-off in both directions; see followWindowOpen.
  if (!followWindowOpen(pick)) {
    return {
      ok: false,
      error: taken
        ? "Kick-off has passed — too late to log this one."
        : "Kick-off has passed — this one is locked in.",
    };
  }

  if (parsed.data.taken) {
    await db
      .insert(pickFollows)
      .values({ userId: auth.user.id, pickId: parsed.data.pickId })
      // Already checked. Nothing to update — created_at must keep saying when
      // the decision was first made, not when it was last tapped.
      .onConflictDoNothing();
  } else {
    await db
      .delete(pickFollows)
      .where(
        and(
          eq(pickFollows.userId, auth.user.id),
          eq(pickFollows.pickId, parsed.data.pickId),
        ),
      );
  }

  // Both surfaces render the same cards from the same rows, so both go stale
  // together. This is what resolves the optimistic circle in the client back to
  // server truth — without it the router cache can serve a stale board on the
  // next navigation and the tick appears to undo itself.
  //
  // Deliberately not revalidating /admin/follows: it is a different person's
  // page, it is force-dynamic, and nobody should pay for an analytics
  // re-render on a tester's tap.
  revalidatePath("/picks");

  // Not audited. The audit log is for operator actions on the record — publish,
  // settle, void, role changes — and a tester ticking a box is ordinary product
  // use, logged by the row itself. Writing one would put a line in the admin
  // activity feed for every tap on the board.
  return { ok: true };
}

/**
 * "I played this parlay" — tail a shared Community ticket or one of Oobee's,
 * or take it back, while every leg is still ahead of kick-off. Not your own
 * ticket (you built it — it's already yours), not a private one, not a draft.
 */
export async function setParlayFollowAction(parlayId: string, played: boolean): Promise<ActionState> {
  const auth = await getAuth();
  if (!auth) return { ok: false, error: "Your session expired — sign in again to log this." };
  const parsed = z.object({ parlayId: z.string().uuid(), played: z.boolean() }).safeParse({ parlayId, played });
  if (!parsed.success) return { ok: false, error: "Bad request" };

  const [row] = await db
    .select({ ownerId: parlays.ownerId, shared: parlays.shared, publishedAt: slates.publishedAt })
    .from(parlays)
    .leftJoin(slates, eq(slates.date, parlays.slateDate))
    .where(eq(parlays.id, parsed.data.parlayId))
    .limit(1);
  if (!row) return { ok: false, error: "That parlay is gone." };
  if (row.ownerId === auth.user.id) return { ok: false, error: "That's your own ticket — it's already on your stats." };
  if (parsed.data.played && !(await canInteract(auth.user.id, row.ownerId))) return { ok: false, error: BLOCKED };
  if (row.ownerId === null ? !row.publishedAt : !row.shared) return { ok: false, error: "That parlay isn't public." };

  const [view] = await getParlaysByIds([parsed.data.parlayId]);
  if (!view?.open) {
    return { ok: false, error: played ? "Too late — a leg has already started." : "This one is locked in — a leg has started." };
  }

  if (parsed.data.played) {
    await db.insert(parlayFollows).values({ userId: auth.user.id, parlayId: parsed.data.parlayId }).onConflictDoNothing();
    await notify([{ userId: row.ownerId, actorId: auth.user.id, kind: "play", parlayId: parsed.data.parlayId }]);
  } else {
    await db
      .delete(parlayFollows)
      .where(and(eq(parlayFollows.userId, auth.user.id), eq(parlayFollows.parlayId, parsed.data.parlayId)));
    await unnotify({ actorId: auth.user.id, kind: "play", parlayId: parsed.data.parlayId });
  }
  revalidatePath("/stats");
  revalidatePath("/community");
  revalidatePath("/picks");
  revalidatePath("/stats");
  return { ok: true };
}
