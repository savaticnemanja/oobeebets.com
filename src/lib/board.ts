import type { Sport } from "@/db/schema";

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

/* ------------------------------------------------------------ board tabs */

/**
 * What the board shows as tabs, which is not the same list as `pickCategories`.
 *
 * Game bets and player props are both rows in `picks` and share every query,
 * rank rule and limit above. Oobee parlays are a different table — several
 * picks riding as one bet, graded from their legs — so they are a third *tab*
 * without being a third *category*. Keeping the two concepts apart is what
 * stops a parlay leaking into the singles record: anything iterating
 * `pickCategories` still sees exactly the two things that live in `picks`.
 */
export const boardTabs = ["game", "prop", "parlay", "community"] as const;

/**
 * The admin slate screen edits Oobee's board only. Community parlays belong
 * to testers, so that tab is not one an admin publishes.
 */
export const adminBoardTabs = ["game", "prop", "parlay"] as const;

export type BoardTab = (typeof boardTabs)[number];

export const TAB_LABELS: Record<BoardTab, string> = {
  ...CATEGORY_LABELS,
  parlay: "Oobee parlays",
  community: "Community parlays",
};

export const TAB_NOUN: Record<BoardTab, string> = {
  ...CATEGORY_NOUN,
  parlay: "parlay",
  community: "community parlay",
};

/**
 * Oobee parlays published per day. Lower than the pick lists on purpose —
 * a parlay is a garnish on a board of singles, and fifteen of them a day
 * would be the parlay bait the front page promises not to serve.
 *
 * parlays_rank_range in the database allows 1..15, so raising this is an edit
 * here rather than a migration. Lowering it never needs one either.
 */
export const PARLAYS_PER_SLATE = 5;

export function isBoardTab(value: unknown): value is BoardTab {
  return typeof value === "string" && (boardTabs as readonly string[]).includes(value);
}

/**
 * Reads a `?category=` param as a board tab, falling back to game bets.
 *
 * Shares the parameter name with categoryFromParam rather than inventing a
 * second one, so every link already written stays correct and a tab the
 * reader has not heard of lands on the default instead of erroring.
 */
export function tabFromParam(value: string | undefined): BoardTab {
  return isBoardTab(value) ? value : "game";
}

/* --------------------------------------------------------- sport filter */

/**
 * The pills under the board's tabs. The four big US leagues match on league;
 * soccer and tennis match the whole sport, since their competitions come and
 * go (a Nations League window, a Masters event) and a pill per competition
 * would be a row of names nobody recognises. `?sport=` carries the key.
 */
export const SPORT_FILTERS = [
  { key: "nfl", label: "NFL", sport: "football", league: "NFL" },
  { key: "nba", label: "NBA", sport: "basketball", league: "NBA" },
  { key: "mlb", label: "MLB", sport: "baseball", league: "MLB" },
  { key: "nhl", label: "NHL", sport: "hockey", league: "NHL" },
  { key: "soccer", label: "Soccer", sport: "soccer", league: null },
  { key: "tennis", label: "Tennis", sport: "tennis", league: null },
] as const satisfies ReadonlyArray<{ key: string; label: string; sport: Sport; league: string | null }>;

export type SportFilter = (typeof SPORT_FILTERS)[number];

/** `?sport=` as a filter; anything unknown means no filter (All). */
export function sportFilterFromParam(value: string | undefined): SportFilter | null {
  return SPORT_FILTERS.find((f) => f.key === value) ?? null;
}

/** Whether a pick or a parlay leg falls under a filter. */
export function matchesSportFilter(filter: SportFilter | null, item: { sport: Sport; league: string }): boolean {
  if (!filter) return true;
  return item.sport === filter.sport && (filter.league === null || item.league === filter.league);
}
