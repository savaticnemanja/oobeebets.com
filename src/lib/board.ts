/**
 * The board is two independent lists — game bets and player props — not one
 * list with a type column read after the fact. Each is ranked from 1 and
 * capped on its own, so a full day is fifteen of each rather than fifteen
 * shared between them, and rank 1 means "best game bet" or "best prop"
 * depending on which tab you are looking at.
 */
export const pickCategories = ["game", "prop"] as const;

export type PickCategory = (typeof pickCategories)[number];

/** Tab labels — the only place the two lists are named for a reader. */
export const CATEGORY_LABELS: Record<PickCategory, string> = {
  game: "Game bets",
  prop: "Player props",
};

/** Singular, for prose about adding or counting one of them. */
export const CATEGORY_NOUN: Record<PickCategory, string> = {
  game: "game bet",
  prop: "player prop",
};

/**
 * Ranked picks published per day, per category.
 *
 * The database agrees with this on both halves: picks_rank_range checks
 * 1..15, and picks_slate_rank_unique is keyed on (slate_date, category, rank)
 * as of migration 0006 — which is what lets rank 1 exist once per category per
 * day instead of once per day. Both limits are 15 today; raising either means
 * a migration to move the check, not just an edit here.
 */
export const PICKS_PER_SLATE: Record<PickCategory, number> = {
  game: 15,
  prop: 15,
};

/**
 * Picks a non-admin viewer sees, per category. Beta is one free tier — no
 * paid plans.
 *
 * Equal to PICKS_PER_SLATE right now, so on a full slate the cut below is a
 * no-op and every tester sees both whole lists. That is the intended beta
 * product, not an oversight; the two stay separate constants because the free
 * limit and the slate size are different decisions, and the day either list
 * goes back above its free limit the truncation starts applying again with no
 * code change.
 */
export const VISIBLE_PICKS: Record<PickCategory, number> = {
  game: 15,
  prop: 15,
};

/** A full day across both tabs — the admin overview's denominator. */
export const TOTAL_PICKS_PER_SLATE = pickCategories.reduce(
  (n, c) => n + PICKS_PER_SLATE[c],
  0,
);

export function isPickCategory(value: unknown): value is PickCategory {
  return typeof value === "string" && (pickCategories as readonly string[]).includes(value);
}

/**
 * Reads a `?category=` search param, falling back to game bets. Anything
 * unrecognised lands on the default tab rather than erroring — a hand-edited
 * URL should not be able to render a broken board.
 */
export function categoryFromParam(value: string | undefined): PickCategory {
  return isPickCategory(value) ? value : "game";
}

/**
 * Admins see the full slate, including drafts and everything past the free
 * limit. Everyone else sees the top VISIBLE_PICKS of each category.
 *
 * The cut is per-row rather than per-call because ranks are per-category: a
 * mixed list holds two rank-1s, and a single shared limit would be applied to
 * whichever category happened to be longer. Reading the limit off each row's
 * own category makes the function correct on a filtered list and a mixed one
 * alike.
 */
export function visiblePicks<T extends { rank: number; category: PickCategory }>(
  picks: T[],
  isAdmin: boolean,
): T[] {
  return isAdmin ? picks : picks.filter((p) => p.rank <= VISIBLE_PICKS[p.category]);
}
