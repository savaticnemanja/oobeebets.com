import type { Pick, PickStatus } from "@/db/schema";

/**
 * Profit in units for a settled pick, using American odds.
 *
 *   +150 at 1u  -> +1.50u
 *   -120 at 1u  -> +0.83u
 *   a loss      -> -1.00u (scaled by stake)
 *   push / void ->  0
 *
 * This is the only place unit maths lives. Every stat on the site is a sum of
 * this function, which is why the track record can never disagree with the
 * pick list.
 */
export function profitUnits(
  price: number,
  units: number,
  status: PickStatus,
): number {
  switch (status) {
    case "won":
      return price > 0 ? units * (price / 100) : units * (100 / Math.abs(price));
    case "lost":
      return -units;
    case "push":
    case "void":
    case "pending":
      return 0;
  }
}

/** Convenience wrapper over a pick row (units arrives as a numeric string). */
export function pickProfit(p: Pick): number {
  return profitUnits(p.price, Number(p.units), p.status);
}

/**
 * Break-even win probability implied by the price, before vig. Used to show
 * "the book priced this at 43%" on the track record.
 */
export function impliedProbability(price: number): number {
  return price > 0 ? 100 / (price + 100) : Math.abs(price) / (Math.abs(price) + 100);
}

/** American odds -> decimal, for payout display. */
export function toDecimalOdds(price: number): number {
  return price > 0 ? price / 100 + 1 : 100 / Math.abs(price) + 1;
}

/** A pick counts toward win rate only if it actually resolved W/L. */
export function countsTowardRate(status: PickStatus): boolean {
  return status === "won" || status === "lost";
}

export const SETTLED_STATUSES: PickStatus[] = ["won", "lost", "push", "void"];

/**
 * Below this many settled picks, a percentage is noise. The UI must label
 * anything under it as "too few to be a rate" rather than printing a number
 * that looks like evidence.
 */
export const MIN_SAMPLE_FOR_RATE = 30;
