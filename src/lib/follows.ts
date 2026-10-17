/**
 * "I took this bet" — the rules behind the check circle on every pick card.
 *
 * Two datasets come out of one table (see pickFollows in db/schema.ts):
 *
 *   Oobee performance    — every published pick, at the stake Oobee called.
 *   Beta user performance — only the picks a tester checked off, flat-staked.
 *
 * They are deliberately not the same arithmetic over the same rows, and the
 * difference between them is the whole point of collecting this: Oobee's
 * record says whether the picks were good, the beta record says whether the
 * picks people actually took were good.
 *
 * Nothing here touches the database, so the client bundle and the server
 * action share one copy of the rules rather than agreeing by coincidence.
 */
import type { PickStatus } from "@/db/schema";

/**
 * What one followed bet is worth, in units.
 *
 * Testers are never asked for a stake — that was the explicit brief, and it is
 * the right call: a stake field turns a one-tap question into a form, and a
 * form is a thing people skip. So the beta record is flat: every bet a tester
 * took counts one unit, win or lose.
 *
 * This is *not* the pick's own `units`. A pick Oobee staked 2u on still counts
 * 1u in the beta record, because what a tester actually risked is unknown and
 * borrowing Oobee's number would quietly turn their record into a rescaled
 * copy of Oobee's — the one comparison this feature exists to make.
 *
 * A string, because that is how `numeric` columns arrive from postgres and
 * pickProfit() takes its units the same way whichever record it is summing.
 */
export const FOLLOW_STAKE_UNITS = "1.00";

/**
 * Whether a pick can still be checked or unchecked.
 *
 * Closed at kick-off, and that boundary is what makes the dataset worth
 * anything. If a follow could be added after the final whistle, "users who
 * follow Oobee perform differently" would measure hindsight; if it could be
 * *removed* after one, every tester's record could be edited into a winning
 * one by unchecking the losers. The window closes while the result is still
 * unknown, so neither move is available and no tombstone column is needed to
 * detect it — the same reason a published slate can't be unpublished once its
 * picks are settled (see unpublishSlateAction).
 *
 * A pick voided before kick-off is closed too: there is nothing left to take.
 *
 * `now` is injectable so the contract can be tested at a fixed instant; every
 * caller in the app leaves it alone.
 */
export function followWindowOpen(
  pick: { startsAt: Date; status: PickStatus },
  now: Date = new Date(),
): boolean {
  return pick.status === "pending" && pick.startsAt.getTime() > now.getTime();
}

/**
 * What a viewer's card needs to know about their own follow. `undefined` on a
 * card means no control at all — an admin previewing an unpublished draft,
 * where there is nothing to take yet.
 */
export interface ViewerFollow {
  taken: boolean;
  /** False once kick-off has passed: the circle shows, but it is read-only. */
  open: boolean;
}

/** Copy for the control, in one place because three states share it. */
export const FOLLOW_LABELS = {
  take: "I took this bet",
  took: "You took this bet",
  closedTaken: "You took this bet — locked at kick-off",
  closedUntaken: "Kick-off has passed",
  started: "Locked — this game has started",
} as const;
