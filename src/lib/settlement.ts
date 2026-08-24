import type { PickStatus } from "@/db/schema";

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

/**
 * Convenience wrapper over a pick row (units arrives as a numeric string).
 *
 * Typed by the three columns it reads rather than by `Pick`, so a caller that
 * selected only those columns can use it without widening its query back out
 * to the whole row.
 */
export function pickProfit(p: {
  price: number;
  units: string;
  status: PickStatus;
}): number {
  return profitUnits(p.price, Number(p.units), p.status);
}

/**
 * Below this many settled picks, a percentage is noise. The UI must label
 * anything under it as "too few to be a rate" rather than printing a number
 * that looks like evidence.
 */
export const MIN_SAMPLE_FOR_RATE = 30;
