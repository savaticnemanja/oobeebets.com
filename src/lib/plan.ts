import type { PickCategory } from "@/db/schema";

/**
 * The product, in one place: one subscription. The first 14 days are a free
 * trial — the card goes in at the start, nothing is charged until the trial
 * ends — then $50 every two weeks until it's cancelled. Cancelling, any time,
 * stops the next charge; access runs to the end of what's already paid for
 * (or the end of the trial, which then never bills at all).
 *
 * The trial is once per account: someone who has subscribed before starts
 * paying straight away.
 *
 * `priceCents` is what the site prints. What a subscriber is charged is the
 * Stripe Price behind `lookupKey` (scripts/stripe-setup.mjs makes it), so a
 * price change is a new Price with the lookup key moved onto it, never an
 * edit to the old one.
 */
export type Access = "subscriber" | "free";

export interface AccessRule {
  /** Open (unsettled) picks a viewer sees, per list, counting from rank 1. */
  picks: Record<PickCategory, number>;
  /** Whether Oobee's open parlays are shown. */
  parlays: boolean;
}

/**
 * Without a subscription, nothing still open: no pick and no parlay before
 * it's graded. Settled ones are history, not tips, so everyone sees those —
 * the record, losses included, is the pitch (see picks/board-days.tsx).
 */
export const ACCESS: Record<Access, AccessRule> = {
  free: { picks: { game: 0, prop: 0 }, parlays: false },
  subscriber: { picks: { game: 100, prop: 100 }, parlays: true },
};

export const PLAN = {
  name: "oobee bets subscription",
  short: "Subscription",
  priceCents: 5000,
  /** Billed every `intervalWeeks` weeks. */
  intervalWeeks: 2,
  trialDays: 14,
  /** The Stripe Price's lookup_key — what checkout asks Stripe for. */
  lookupKey: "oobee_sub_2w",
  /** The Stripe product's description — shown under the line item in Checkout, trial or not. */
  tagline: "Every pick, every game day, before kick-off. Cancel anytime.",
  features: ["Every game bet, every game day", "Every player prop, every game day", "Oobee's parlays", "Full reasoning on every pick"],
} as const;

/** "$50 every 2 weeks". */
export const PLAN_PRICE_LABEL = `${formatPrice(PLAN.priceCents)} every ${PLAN.intervalWeeks} weeks`;

/**
 * Stripe statuses that open the board. A failed renewal (past_due) does not:
 * the account page asks for a new card, and the board opens again the moment
 * Stripe takes the payment.
 */
export const LIVE_STATUSES = ["trialing", "active"] as const;

/** Statuses that still have a subscription to manage (and so mustn't get a second one). */
export const OPEN_STATUSES = ["trialing", "active", "past_due", "unpaid", "paused", "incomplete"] as const;

export function isLiveStatus(status: string): boolean {
  return (LIVE_STATUSES as readonly string[]).includes(status);
}

/** "$50", or "$49.99" when there are cents. */
export function formatPrice(cents: number): string {
  return `$${cents % 100 === 0 ? cents / 100 : (cents / 100).toFixed(2)}`;
}
