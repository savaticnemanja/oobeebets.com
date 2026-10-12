import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { games, parlayLegs, parlaySelectionLegs, parlays, picks, selections, slates, userFollows, users } from "@/db/schema";
import { LEAGUE_CONFIG, eventLabel, lineLabel, marketCategory, marketEnum, type FeedLeague } from "./odds/markets";
import type { Market, PickCategory, PickStatus, Role, Sport } from "@/db/schema";
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

/**
 * One leg, as every ticket renders it. Either one of Oobee's picks (Oobee's
 * parlays, and testers' parlays from before the feed) or a feed selection
 * (community parlays) — the ticket draws both the same way.
 */
export interface ParlayLegView {
  /** Stable React key: the pick id or the selection id. */
  key: string;
  pickId: string | null;
  selectionId: string | null;
  /** Oobee's rank, on a pick leg. */
  rank: number | null;
  /** Where the price came from, on a selection leg. */
  book: string | null;
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
  /** On the Community tab. */
  shared: boolean;
  /** Who built it — filled for the Community tab, null elsewhere. */
  ownerUsername: string | null;
  ownerDisplayName: string | null;
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
  shared: boolean;
  ownerUsername?: string | null;
  ownerDisplayName?: string | null;
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
      book: picks.book,
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

  // Community legs: selections, with the game they are on. Same columns,
  // derived the way createPickAction derives a pick's, so a leg and a pick on
  // the same bet read identically.
  const selRows = await db
    .select({ parlayId: parlaySelectionLegs.parlayId, sel: selections, game: games })
    .from(parlaySelectionLegs)
    .innerJoin(selections, eq(selections.id, parlaySelectionLegs.selectionId))
    .innerJoin(games, eq(games.id, selections.gameId))
    .where(
      inArray(
        parlaySelectionLegs.parlayId,
        rows.map((r) => r.id),
      ),
    );

  const byParlay = new Map<string, ParlayLegView[]>();
  const push = (parlayId: string, leg: ParlayLegView) => {
    let list = byParlay.get(parlayId);
    if (!list) byParlay.set(parlayId, (list = []));
    list.push(leg);
  };
  for (const { parlayId, ...l } of legRows) {
    push(parlayId, { ...l, key: l.pickId, selectionId: null });
  }
  for (const { parlayId, sel, game } of selRows) {
    push(parlayId, {
      key: sel.id,
      pickId: null,
      selectionId: sel.id,
      rank: null,
      book: sel.bookTitle,
      category: marketCategory(sel.marketKey),
      sport: LEAGUE_CONFIG[game.league as FeedLeague]?.sport ?? "football",
      market: marketEnum(sel.marketKey),
      league: game.league,
      event: eventLabel(game),
      selection: lineLabel(sel),
      price: sel.price,
      status: sel.status,
      startsAt: game.commenceTime,
      finalScore: sel.finalScore,
    });
  }
  // Kick-off order across both kinds.
  for (const list of byParlay.values()) {
    list.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
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
      shared: r.shared,
      ownerUsername: r.ownerUsername ?? null,
      ownerDisplayName: r.ownerDisplayName ?? null,
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
  shared: parlays.shared,
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

/**
 * The Community tab: every parlay a tester chose to share for one slate day,
 * newest first, with who built it.
 */
export async function getCommunityParlays(slateDate: string, limit = 100): Promise<ParlayView[]> {
  const rows = await db
    .select({
      ...PARLAY_COLUMNS,
      ownerEmail: sql<string | null>`null`,
      ownerUsername: users.username,
      ownerDisplayName: users.displayName,
    })
    .from(parlays)
    .innerJoin(users, eq(users.id, parlays.ownerId))
    .where(and(eq(parlays.slateDate, slateDate), eq(parlays.shared, true)))
    .orderBy(desc(parlays.createdAt))
    .limit(limit);

  return hydrate(rows);
}

/**
 * Shared parlays for the Home feed, newest first, each with who built it.
 *
 * `followingOf` narrows to the people a viewer follows, plus the viewer — the
 * Following tab. `from` (inclusive) and `to` (exclusive) bound created_at, which
 * is how the feed pages these alongside posts without a cursor of their own.
 * The owner's role rides along for the verified badge next to their name.
 */
export async function getFeedParlays(opts: {
  followingOf?: string;
  from?: Date | null;
  to?: Date | null;
  limit: number;
  offset?: number;
}): Promise<Array<{ parlay: ParlayView; ownerRole: Role }>> {
  const rows = await db
    .select({
      ...PARLAY_COLUMNS,
      ownerEmail: sql<string | null>`null`,
      ownerUsername: users.username,
      ownerDisplayName: users.displayName,
      ownerRole: users.role,
    })
    .from(parlays)
    .innerJoin(users, eq(users.id, parlays.ownerId))
    .where(
      and(
        eq(parlays.shared, true),
        opts.followingOf
          ? sql`(${parlays.ownerId} = ${opts.followingOf} or ${parlays.ownerId} in (select ${userFollows.followeeId} from ${userFollows} where ${userFollows.followerId} = ${opts.followingOf}))`
          : undefined,
        opts.from ? gte(parlays.createdAt, opts.from) : undefined,
        opts.to ? lt(parlays.createdAt, opts.to) : undefined,
      ),
    )
    .orderBy(desc(parlays.createdAt), desc(parlays.id))
    .limit(opts.limit)
    .offset(opts.offset ?? 0);

  const roles = new Map(rows.map((r) => [r.id, r.ownerRole]));
  const views = await hydrate(rows);
  return views.map((parlay) => ({ parlay, ownerRole: roles.get(parlay.id) ?? "user" }));
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
