/** Total ranked picks published per day. */
export const PICKS_PER_SLATE = 30;

/** Picks a non-admin viewer sees. Beta is one free tier — no paid plans. */
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
