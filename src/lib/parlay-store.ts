import "server-only";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { parlayLegs, parlays, picks, slates, users } from "@/db/schema";
import type { Market, PickCategory, PickStatus, Sport } from "@/db/schema";
import { PARLAY_STAKE_UNITS, parlayPrice, parlayProfit, parlayStatus, parlayWindowOpen } from "./parlays";

/**
 * Reading parlays out of the database and handing every surface the same
 * object.
 *
 * The rules themselves are in lib/parlays.ts and are pure; this file is the
 * part that touches Postgres. The split matters because the board, the
 * dashboard and the admin inspector must grade a parlay identically, and the
 * only way to guarantee that is for all three to receive a row that has
 * already been graded once, here.
 */

/** One leg, as every ticket renders it. */
export interface ParlayLegView {
  pickId: string;
  rank: number;
  category: PickCategory;
  sport: Sport;
  market: Market;
  league: string;
  event: string;
  selection: string;
  price: number;
  status: PickStatus;
  startsAt: Date;
  finalScore: string | null;
}

/**
 * A parlay with its legs and everything derived from them already worked out.
 *
 * `status`, `price` and `profit` are computed, never stored — see the note on
 * the parlays table in db/schema.ts. `price` is the *live* price: once a leg
 * pushes or voids it is the repriced figure, not what the ticket said when it
 * was built.
 */
export interface ParlayView {
  id: string;
  ownerId: string | null;
  /** Only populated by the admin inspector, which joins users. */
  ownerEmail: string | null;
  slateDate: string;
  rank: number | null;
  title: string | null;
  /** What Oobee recorded the book as offering, before any leg dropped out. */
  bookPrice: number | null;
  confidence: number | null;
  evPct: string | null;
  reasoning: string | null;
  book: string | null;
  createdAt: Date;
  legs: ParlayLegView[];
  status: PickStatus;
  price: number | null;
  stakeUnits: number;
  profit: number;
  /** Still editable: every leg is ahead of kick-off. */
  open: boolean;
}

/** Oobee's parlays carry their own stake; a tester's is always flat. */
function stakeFor(ownerId: string | null, units: string | null): number {
  return ownerId === null ? Number(units ?? "1.00") : Number(PARLAY_STAKE_UNITS);
}

interface ParlayRow {
  id: string;
  ownerId: string | null;
  ownerEmail: string | null;
  slateDate: string;
  rank: number | null;
  title: string | null;
  price: number | null;
  units: string | null;
  confidence: number | null;
  evPct: string | null;
  reasoning: string | null;
  book: string | null;
  createdAt: Date;
}

/**
 * Attaches legs to a set of parlay rows and grades each one.
 *
 * Two queries rather than one join, deliberately. A join would repeat every
 * parlay's own columns once per leg and leave the grouping to be unpicked in
 * memory; fetching the legs for a known set of ids is a single index range
 * read on parlay_legs' primary key and arrives already shaped.
 */
async function hydrate(rows: ParlayRow[]): Promise<ParlayView[]> {
  if (rows.length === 0) return [];

  const legRows = await db
    .select({
      parlayId: parlayLegs.parlayId,
      pickId: picks.id,
      rank: picks.rank,
      category: picks.category,
      sport: picks.sport,
      market: picks.market,
      league: picks.league,
      event: picks.event,
      selection: picks.selection,
      price: picks.price,
      status: picks.status,
      startsAt: picks.startsAt,
      finalScore: picks.finalScore,
    })
    .from(parlayLegs)
    .innerJoin(picks, eq(picks.id, parlayLegs.pickId))
    .where(
      inArray(
        parlayLegs.parlayId,
        rows.map((r) => r.id),
      ),
    )
    // Kick-off order, so a ticket reads in the order it will actually play out.
    .orderBy(asc(picks.startsAt), asc(picks.rank));

  const byParlay = new Map<string, ParlayLegView[]>();
  for (const l of legRows) {
    let list = byParlay.get(l.parlayId);
    if (!list) byParlay.set(l.parlayId, (list = []));
    list.push(l);
  }

  return rows.map((r) => {
    const legs = byParlay.get(r.id) ?? [];
    const stakeUnits = stakeFor(r.ownerId, r.units);
    return {
      id: r.id,
      ownerId: r.ownerId,
      ownerEmail: r.ownerEmail,
      slateDate: r.slateDate,
      rank: r.rank,
      title: r.title,
      bookPrice: r.price,
      confidence: r.confidence,
      evPct: r.evPct,
      reasoning: r.reasoning,
      book: r.book,
      createdAt: r.createdAt,
      legs,
      status: parlayStatus(legs),
      price: parlayPrice(legs, r.price),
      stakeUnits,
      profit: parlayProfit(legs, stakeUnits, r.price),
      open: parlayWindowOpen(legs),
    };
  });
}

/** The columns every parlay query selects. */
const PARLAY_COLUMNS = {
  id: parlays.id,
  ownerId: parlays.ownerId,
  slateDate: parlays.slateDate,
  rank: parlays.rank,
  title: parlays.title,
  price: parlays.price,
  units: parlays.units,
  confidence: parlays.confidence,
  evPct: parlays.evPct,
  reasoning: parlays.reasoning,
  book: parlays.book,
  createdAt: parlays.createdAt,
} as const;

/**
 * Oobee's own parlays for one slate — the third board tab.
 *
 * `isNull(ownerId)` is the whole filter: a tester's parlay is never on the
 * board, however many people build one.
 */
export async function getOobeeParlays(slateDate: string): Promise<ParlayView[]> {
  const rows = await db
    .select({ ...PARLAY_COLUMNS, ownerEmail: sql<string | null>`null` })
    .from(parlays)
    .where(and(eq(parlays.slateDate, slateDate), isNull(parlays.ownerId)))
    .orderBy(asc(parlays.rank));

  return hydrate(rows);
}

/** One tester's own parlays, newest slate first — their dashboard. */
export async function getUserParlays(userId: string): Promise<ParlayView[]> {
  const rows = await db
    .select({ ...PARLAY_COLUMNS, ownerEmail: sql<string | null>`null` })
    .from(parlays)
    .where(eq(parlays.ownerId, userId))
    .orderBy(desc(parlays.slateDate), desc(parlays.createdAt));

  return hydrate(rows);
}

/**
 * Every parlay a tester has built — the admin inspector.
 *
 * Admin-owned parlays are excluded for the same reason admin follows are: the
 * people running the beta tick boxes while testing the thing, and their
 * tickets are not evidence about testers.
 */
export async function getAllUserParlays(limit = 200): Promise<ParlayView[]> {
  const rows = await db
    .select({ ...PARLAY_COLUMNS, ownerEmail: users.email })
    .from(parlays)
    .innerJoin(users, and(eq(users.id, parlays.ownerId), eq(users.role, "user")))
    .orderBy(desc(parlays.createdAt))
    .limit(limit);

  return hydrate(rows);
}

/** One parlay by id, graded. Null when it does not exist. */
export async function getParlay(id: string): Promise<ParlayView | null> {
  const rows = await db
    .select({ ...PARLAY_COLUMNS, ownerEmail: users.email })
    .from(parlays)
    .leftJoin(users, eq(users.id, parlays.ownerId))
    .where(eq(parlays.id, id))
    .limit(1);

  const [view] = await hydrate(rows);
  return view ?? null;
}

/**
 * The picks a parlay may legally be built from: on a published slate, and
 * still ahead of kick-off.
 *
 * Used by the builder to render its options and by the action to re-check
 * them — the second is what matters, since the first is only a suggestion the
 * client can ignore.
 */
export async function selectableLegs(slateDate: string) {
  return db
    .select({
      id: picks.id,
      rank: picks.rank,
      category: picks.category,
      league: picks.league,
      event: picks.event,
      selection: picks.selection,
      price: picks.price,
      startsAt: picks.startsAt,
      status: picks.status,
    })
    .from(picks)
    .innerJoin(slates, eq(slates.date, picks.slateDate))
    .where(
      and(
        eq(picks.slateDate, slateDate),
        sql`${slates.publishedAt} is not null`,
        eq(picks.status, "pending"),
        sql`${picks.startsAt} > now()`,
      ),
    )
    .orderBy(asc(picks.category), asc(picks.rank));
}
