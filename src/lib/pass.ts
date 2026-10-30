import type { PickCategory } from "@/db/schema";

/**
 * The product, in one place: a 14-day pass, paid once. It never renews —
 * when the 14 days are up the viewer is back on the free board until they buy
 * another. One bought while a pass is still running starts where that one
 * ends, so nobody loses days by buying early.
 *
 * `priceCents` is what the account page prints. What a buyer is charged is
 * the Stripe Price behind `lookupKey` (scripts/stripe-setup.mjs makes it), so
 * a price change is a new Price with the lookup key moved onto it, never an
 * edit to the old one.
 */
export type Access = "pass" | "free";

export interface AccessRule {
  /** Ranks a viewer sees, per pick list, counting from 1. */
  picks: Record<PickCategory, number>;
  /** Whether the Parlays tab shows Oobee's parlays. */
  parlays: boolean;
}

export const ACCESS: Record<Access, AccessRule> = {
  free: { picks: { game: 1, prop: 1 }, parlays: false },
  pass: { picks: { game: 100, prop: 100 }, parlays: true },
};

export const PASS = {
  name: "14-day pass",
  priceCents: 5000,
  days: 14,
  /** The Stripe Price's lookup_key — what checkout asks Stripe for. */
  lookupKey: "oobee_pass_14d",
  tagline: "The whole board for two weeks. Paid once — it doesn't renew.",
  features: ["Every game bet, every game day", "Every player prop, every game day", "Oobee's parlays", "Full reasoning on every pick"],
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * When a pass bought at `now` runs: from now, or from the end of the latest
 * pass still to run out if there is one, for PASS.days days.
 */
export function passWindow(now: Date, latestEnd: Date | null): { startsAt: Date; endsAt: Date } {
  const startsAt = latestEnd && latestEnd.getTime() > now.getTime() ? latestEnd : now;
  return { startsAt, endsAt: new Date(startsAt.getTime() + PASS.days * DAY_MS) };
}

/**
 * How long the passes cover from `at` on: the end of the unbroken run of
 * passes that includes `at`, or null if none does. Back-to-back passes count
 * as one run; a gap (a refunded pass in the middle, say) ends it.
 */
export function coveredUntil(passes: readonly { startsAt: Date; endsAt: Date }[], at: Date): Date | null {
  let end: Date | null = null;
  for (const p of [...passes].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())) {
    const reach = (end ?? at).getTime();
    if (p.startsAt.getTime() > reach) break;
    if (p.endsAt.getTime() > reach) end = p.endsAt;
  }
  return end;
}

/** "$50", or "$49.99" when there are cents. */
export function formatPrice(cents: number): string {
  return `$${cents % 100 === 0 ? cents / 100 : (cents / 100).toFixed(2)}`;
}
