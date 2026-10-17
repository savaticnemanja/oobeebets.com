/**
 * How a parlay behaves: when it can be built, what it is worth, and how it is
 * graded from the legs underneath it.
 *
 * Nothing here touches the database. The board, the dashboard, the admin
 * inspector and the server actions all grade a parlay by calling the same two
 * functions, so a parlay shown as live on one page can never be shown as lost
 * on another.
 *
 * The rules are the sportsbook's, not ours — a push or a void leg drops out
 * and the parlay reprices on what is left, rather than killing the ticket.
 * Getting that wrong is the difference between a tester's record and a
 * fiction, so it is spelled out rather than assumed.
 */
import type { PickStatus } from "@/db/schema";
import { americanToDecimal, combineOdds, profitUnits } from "./settlement";

/**
 * What one tester's parlay counts as, in units.
 *
 * Same reasoning as FOLLOW_STAKE_UNITS for singles, and deliberately the same
 * number: a tester is never asked for a stake, so every bet they place counts
 * one unit whether it is a single or a six-leg. Oobee's own parlays carry a
 * real stake in `parlays.units` and do not use this.
 */
export const PARLAY_STAKE_UNITS = "1.00";

/** A parlay must be at least this many legs, or it is a single wearing a hat. */
export const MIN_PARLAY_LEGS = 2;

/**
 * And at most this many. Not a book rule — a blast radius. Ten legs at -110 is
 * a 600/1 lottery ticket, and a tester building one is telling us less about
 * our picks than about their boredom. It also bounds the rows one insert can
 * write.
 */
export const MAX_PARLAY_LEGS = 10;

/** The columns grading reads off a leg, and nothing else. */
export interface ParlayLegLike {
  price: number;
  status: PickStatus;
}

/**
 * A leg that still counts. Pushes and voids are no-action: the book refunds
 * that portion and the parlay carries on a leg lighter, so they are removed
 * before anything else is decided.
 */
function live(legs: ParlayLegLike[]): ParlayLegLike[] {
  return legs.filter((l) => l.status !== "push" && l.status !== "void");
}

/**
 * The parlay's result, derived — never stored. See the note on the `parlays`
 * table in db/schema.ts for why.
 *
 * Order matters here. A lost leg settles the whole ticket immediately, even
 * with other legs still to play, which is why it is checked before anything
 * is asked about what is pending.
 */
export function parlayStatus(legs: ParlayLegLike[]): PickStatus {
  if (legs.length === 0) return "void";

  // One gone, all gone — and it is decided the moment that leg is graded,
  // without waiting for the rest to play out.
  if (legs.some((l) => l.status === "lost")) return "lost";

  const remaining = live(legs);

  // Every leg pushed or voided: the whole ticket is no action, not a win.
  if (remaining.length === 0) return "void";

  if (remaining.every((l) => l.status === "won")) return "won";
  return "pending";
}

/**
 * The price the parlay will actually pay, after pushed and voided legs have
 * dropped out.
 *
 * This is why a stored price would go stale: a three-leg at +600 whose middle
 * leg pushes is a two-leg at +264, and the number on the ticket when it was
 * built is no longer what it pays. Null when nothing is left to pay on.
 *
 * `bookPrice` wins when it is set and no leg has dropped — that is Oobee
 * recording what the book actually offered, which for correlated legs is
 * rarely the naive product. Once a leg drops out the book price describes a
 * bet that no longer exists, so the surviving legs are repriced instead.
 */
export function parlayPrice(
  legs: ParlayLegLike[],
  bookPrice?: number | null,
): number | null {
  const remaining = live(legs);
  if (remaining.length === 0) return null;
  if (bookPrice != null && remaining.length === legs.length) return bookPrice;
  return combineOdds(remaining.map((l) => l.price));
}

/**
 * Profit in units, routed through the same profitUnits every single on the
 * site is settled by — so a parlay and a pick can never disagree about what a
 * price is worth.
 */
export function parlayProfit(
  legs: ParlayLegLike[],
  units: number,
  bookPrice?: number | null,
): number {
  const status = parlayStatus(legs);
  const price = parlayPrice(legs, bookPrice);
  if (price === null) return 0;
  return profitUnits(price, units, status);
}

/**
 * Decimal payout multiplier, for showing "1u returns 7.4u" on a ticket.
 * Null whenever there is no live price to quote.
 */
export function parlayReturn(
  legs: ParlayLegLike[],
  bookPrice?: number | null,
): number | null {
  const price = parlayPrice(legs, bookPrice);
  return price === null ? null : americanToDecimal(price);
}

/**
 * A parlay can be built, edited or deleted only while every one of its legs is
 * still ahead of kick-off.
 *
 * The earliest leg closes the ticket, which is stricter than closing each leg
 * on its own clock — and it has to be. If legs could be added after the first
 * one kicked off, a tester could watch leg one win and only then decide what
 * to attach to it, which is not a parlay anyone could have placed.
 *
 * Same principle as followWindowOpen in lib/follows.ts: the window shuts while
 * every outcome is still unknown, so there is nothing to edit in hindsight.
 */
export function parlayWindowOpen(
  legs: { startsAt: Date; status: PickStatus }[],
  now: Date = new Date(),
): boolean {
  if (legs.length === 0) return false;
  return legs.every(
    (l) => l.status === "pending" && l.startsAt.getTime() > now.getTime(),
  );
}

/** Copy shared by the builder and the ticket. */
export const PARLAY_LABELS = {
  build: "Build a parlay",
  tooFew: `Pick at least ${MIN_PARLAY_LEGS} to make a parlay`,
  tooMany: `A parlay tops out at ${MAX_PARLAY_LEGS} legs`,
} as const;
