import type { PickCategory, Tier } from "@/db/schema";

/**
 * The product, in one table.
 *
 * A viewer is on a paid tier or on `free`. Each tier unlocks a depth of the
 * board — ranks 1..N of each pick list, game bets and player props counted
 * separately because ranks are per category (see lib/board.ts) — and Pro and
 * up add Oobee's parlays. Tiers are strict supersets: Elite sees everything
 * Pro does, Pro everything Base does.
 *
 * `priceCents` is what the account page's plan list prints. What a subscriber
 * is charged is the Stripe Price behind `lookupKey` (scripts/stripe-setup.mjs
 * makes them),
 * so a price rise is a new Price with the lookup key moved onto it, never an
 * edit to the old one — existing subscribers keep the Price they signed up on.
 */
export const tierValues = ["base", "pro", "elite"] as const;

export type Access = Tier | "free";

export interface AccessRule {
  /** Ranks a viewer sees, per pick list, counting from 1. */
  picks: Record<PickCategory, number>;
  /** Whether the Parlays tab shows Oobee's parlays. */
  parlays: boolean;
}

export const ACCESS: Record<Access, AccessRule> = {
  free: { picks: { game: 1, prop: 1 }, parlays: false },
  base: { picks: { game: 5, prop: 5 }, parlays: false },
  pro: { picks: { game: 10, prop: 10 }, parlays: true },
  elite: { picks: { game: 100, prop: 100 }, parlays: true },
};

export interface TierConfig {
  id: Tier;
  name: string;
  priceCents: number;
  /** The Stripe Price's lookup_key — what checkout asks Stripe for. */
  lookupKey: string;
  tagline: string;
  readonly features: readonly string[];
}

export const TIERS = {
  base: {
    id: "base",
    name: "Base",
    priceCents: 4999,
    lookupKey: "oobee_base_monthly",
    tagline: "The top of the board, every game day.",
    features: ["Top 5 game bets every game day", "Top 5 player props every game day", "Full reasoning on every pick"],
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceCents: 9999,
    lookupKey: "oobee_pro_monthly",
    tagline: "Twice the board, and Oobee's parlays.",
    features: ["Top 10 game bets every game day", "Top 10 player props every game day", "Oobee's parlays", "Everything in Base"],
  },
  elite: {
    id: "elite",
    name: "Elite",
    priceCents: 19999,
    lookupKey: "oobee_elite_monthly",
    tagline: "Every pick we make. Nothing held back.",
    features: ["Every game bet — up to 100 a game day", "Every player prop — up to 100 a game day", "Oobee's parlays", "Everything in Pro"],
  },
} as const satisfies Record<Tier, TierConfig>;

export const TIER_ORDER: readonly Tier[] = tierValues;

export function isTier(value: unknown): value is Tier {
  return typeof value === "string" && (tierValues as readonly string[]).includes(value);
}

/** The tier a Stripe lookup key belongs to, or null for a Price this app didn't make. */
export function tierForLookupKey(key: string | null | undefined): Tier | null {
  return TIER_ORDER.find((t) => TIERS[t].lookupKey === key) ?? null;
}

/** Is `a` at least as high as `b`? Free is below every tier. */
export function accessAtLeast(a: Access, b: Access): boolean {
  const rank = (x: Access) => (x === "free" ? -1 : TIER_ORDER.indexOf(x));
  return rank(a) >= rank(b);
}

/** The lowest tier that shows a pick of this rank, or null past the slate. */
export function tierForRank(category: PickCategory, rank: number): Tier | null {
  return TIER_ORDER.find((t) => rank <= ACCESS[t].picks[category]) ?? null;
}

/** "$49.99" */
export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
