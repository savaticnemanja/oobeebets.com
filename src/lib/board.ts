/**
 * Total ranked picks published per day.
 *
 * The DB agrees with this: picks_rank_range checks 1..15 (migration 0005), so
 * moving this number means a migration, not just an edit here.
 */
export const PICKS_PER_SLATE = 15;

/**
 * Picks a non-admin viewer sees. Beta is one free tier — no paid plans.
 *
 * Equal to PICKS_PER_SLATE right now, so on a full slate the cut below is a
 * no-op and every tester sees the whole board. That is the intended beta
 * product, not an oversight; the two stay separate constants because the free
 * limit and the slate size are different decisions, and the day the board goes
 * back above 15 the truncation starts applying again with no code change.
 */
export const VISIBLE_PICKS = 15;

/**
 * Admins see the full slate, including drafts and everything past the free
 * limit. Everyone else sees the top VISIBLE_PICKS.
 */
export function visiblePicks<T extends { rank: number }>(
  picks: T[],
  isAdmin: boolean,
): T[] {
  return isAdmin ? picks : picks.filter((p) => p.rank <= VISIBLE_PICKS);
}
