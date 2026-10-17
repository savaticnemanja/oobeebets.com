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
/** The most units Oobee may put on one pick: game bets go to 100, props stay at 10. */
export const MAX_UNITS: Record<PickCategory, number> = {
  game: 100,
  prop: 10,
};

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
  /** The viewer's plan's depth (lib/tiers.ts); the free beta's when billing is off. */
  limits: Record<PickCategory, number> = VISIBLE_PICKS,
): T[] {
  return isAdmin ? picks : picks.filter((p) => p.rank <= limits[p.category]);
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

/**
 * The tabs on Picks — Oobee's own board. Shared tickets have their own page,
 * Community (/community), paged by ticket (community/community-feed.tsx);
 * "community" stays a tab value only so old ?category= links redirect there.
 */
export const pickTabs = ["game", "prop", "parlay"] as const;

export const TAB_LABELS: Record<BoardTab, string> = {
  ...CATEGORY_LABELS,
  parlay: "Parlays",
  community: "Community",
};

export const TAB_NOUN: Record<BoardTab, string> = {
  ...CATEGORY_NOUN,
  parlay: "parlay",
  community: "community parlay",
};

/**
 * Oobee parlays published per day. Lower than the pick lists on purpose —
 * a parlay is a garnish on a board of singles, and fifteen of them a day
 * would be parlay bait.
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
 * The sports oobee covers — the pills under the board's tabs, on Community
 * and on Players. NFL only, for now: with one sport there is no "All", and
 * every board, Community and Players show just it — older picks and parlays
 * in other sports stay in the database, out of sight. Adding a sport back is
 * a line here (a league matches on league; a sport with no single league,
 * like soccer, sets league: null and matches the whole sport), plus its feed
 * league in lib/odds/markets.ts and its table in lib/players/catalog.ts.
 * `?sport=` carries the key.
 */
export const SPORT_FILTERS = [
  { key: "nfl", label: "NFL", sport: "football", league: "NFL" },
] as const satisfies ReadonlyArray<{ key: string; label: string; sport: Sport; league: string | null }>;

export type SportFilter = (typeof SPORT_FILTERS)[number];

/** The one sport, while there's only one: every list is filtered to it. */
export const ONLY_SPORT: SportFilter | null = SPORT_FILTERS.length === 1 ? SPORT_FILTERS[0] : null;

/** `?sport=` as a filter; anything unknown means All — or, with one sport, that sport. */
export function sportFilterFromParam(value: string | undefined): SportFilter | null {
  return SPORT_FILTERS.find((f) => f.key === value) ?? ONLY_SPORT;
}

/** Whether a pick or a parlay leg falls under a filter. */
export function matchesSportFilter(filter: SportFilter | null, item: { sport: Sport; league: string }): boolean {
  if (!filter) return true;
  return item.sport === filter.sport && (filter.league === null || item.league === filter.league);
}
