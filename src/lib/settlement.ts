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

/* --------------------------------------------------------------- parlays */

/**
 * American odds -> decimal. -110 becomes 1.909, +150 becomes 2.5.
 *
 * Decimal is the only form parlay maths works in: the combined price of
 * several legs is the product of their decimals, and there is no equivalent
 * arithmetic on American odds.
 */
export function americanToDecimal(price: number): number {
  return price > 0 ? 1 + price / 100 : 1 + 100 / Math.abs(price);
}

/**
 * Decimal -> American, the inverse of the above.
 *
 * The 2.0 boundary is where a price stops being a favourite and starts being
 * a dog: evens is +100 either way, and either formula returns it, so the
 * branch is not a special case so much as the point the two halves meet.
 *
 * One price does not survive a round trip through decimal as the same string:
 * -100 comes back as +100. That is correct rather than lossy — they are the
 * same bet at evens, and +100 is how a book writes it — but it means this is
 * a normalisation, not a pure inverse, and a test asserting
 * decimalToAmerican(americanToDecimal(p)) === p has to allow for it. Every
 * other legal price, favourite or dog, returns exactly as it went in.
 */
export function decimalToAmerican(decimal: number): number {
  return decimal >= 2
    ? Math.round((decimal - 1) * 100)
    : Math.round(-100 / (decimal - 1));
}

/**
 * The combined American price of a set of legs.
 *
 * Returns null for an empty list — not +100, which would be a free bet.
 */
export function combineOdds(prices: number[]): number | null {
  if (prices.length === 0) return null;
  return decimalToAmerican(
    prices.reduce((acc, p) => acc * americanToDecimal(p), 1),
  );
}
