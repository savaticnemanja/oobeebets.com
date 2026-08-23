import type { Tier } from "@/db/schema";

/**
 * The product, in one table.
 *
 * `picksPerDay` is the count of ranks a tier unlocks, counting from rank 1.
 * Tiers are strict supersets: elite sees everything base sees.
 *
 * `priceCents` here is the *default* launch price. The live price is read from
 * the `settings` table (key: `pricing`) so it can be raised monthly without a
 * deploy. Existing subscribers keep the price frozen on their subscription row.
 */
export const TIERS = {
  base: {
    id: "base",
    name: "Base",
    picksPerDay: 6,
    priceCents: 4900,
    stripePriceIdEnv: "STRIPE_PRICE_BASE",
    tagline: "The top of the board, every day.",
    features: [
      "Top 6 picks daily",
      "Full reasoning on every pick",
      "Live settlement + track record",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    picksPerDay: 15,
    priceCents: 9900,
    stripePriceIdEnv: "STRIPE_PRICE_PRO",
    tagline: "Half the board. The best value spots.",
    features: [
      "Top 15 picks daily",
      "Everything in Base",
      "Confidence + EV on every pick",
      "Full pick history",
    ],
  },
  elite: {
    id: "elite",
    name: "Elite",
    picksPerDay: 30,
    priceCents: 19900,
    stripePriceIdEnv: "STRIPE_PRICE_ELITE",
    tagline: "Every pick we make. Nothing held back.",
    features: [
      "All 30 picks daily",
      "Everything in Pro",
      "Earliest access when the slate drops",
      "Priority support",
    ],
  },
} as const satisfies Record<Tier, TierConfig>;

export interface TierConfig {
  id: Tier;
  name: string;
  picksPerDay: number;
  priceCents: number;
  stripePriceIdEnv: string;
  tagline: string;
  readonly features: readonly string[];
}

export const TIER_ORDER: readonly Tier[] = ["base", "pro", "elite"];

/** Total picks published per day. Also the elite unlock count. */
export const PICKS_PER_SLATE = 30;

/** Beta: a single free tier for every visitor — no paid plans. */
export const FREE_VISIBLE_RANKS = 15;

/** Hard ceiling on live subscriptions. Enforced server-side at checkout. */
export const DEFAULT_SEAT_CAP = 1000;

export const TRIAL_DAYS = 3;

export function tierConfig(tier: Tier): TierConfig {
  return TIERS[tier];
}

/** Is `a` at least as high as `b`? */
export function tierAtLeast(a: Tier, b: Tier): boolean {
  return TIER_ORDER.indexOf(a) >= TIER_ORDER.indexOf(b);
}

/** The lowest tier that unlocks a given rank. */
export function tierForRank(rank: number): Tier {
  for (const t of TIER_ORDER) {
    if (rank <= TIERS[t].picksPerDay) return t;
  }
  return "elite";
}
