import "server-only";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { games, parlayFollows, parlayLegs, parlaySelectionLegs, parlays, picks, selections, slates, users } from "@/db/schema";
import { LEAGUE_CONFIG, eventLabel, lineLabel, marketCategory, marketEnum, type FeedLeague } from "./odds/markets";
import type { Market, PickCategory, PickStatus, Role, Sport } from "@/db/schema";
import { visibleTo } from "@/lib/moderation";
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
  /** Oobee's: listed first on its day on the board. */
  featured: boolean;
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
  ownerAvatarId: string | null;
  legs: ParlayLegView[];
  status: PickStatus;
  price: number | null;
  stakeUnits: number;
  profit: number;
  /** Still editable: every leg is ahead of kick-off. */
  open: boolean;
  /** Whether the viewer has played (tailed) it — set by markPlayed. */
  played?: boolean;
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
  featured: boolean;
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
  ownerAvatarId?: string | null;
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
      featured: r.featured,
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
      ownerAvatarId: r.ownerAvatarId ?? null,
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
  featured: parlays.featured,
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
export async function getAllUserParlays({ limit = 25, offset = 0 }: { limit?: number; offset?: number } = {}): Promise<ParlayView[]> {
  const rows = await db
    .select({ ...PARLAY_COLUMNS, ownerEmail: users.email })
    .from(parlays)
    .innerJoin(users, and(eq(users.id, parlays.ownerId), eq(users.role, "user")))
    .orderBy(desc(parlays.createdAt), desc(parlays.id))
    .limit(limit)
    .offset(offset);

  return hydrate(rows);
}

export interface UserParlayTotals {
  parlays: number;
  builders: number;
  shared: number;
  avgLegs: number | null;
  /** Still pending. */
  running: number;
  /** For recordFromCounts, at PARLAY_STAKE_UNITS. */
  counts: { wins: number; losses: number; pushes: number; voids: number; pending: number; net: number };
}

/**
 * The admin inspector's totals over every tester parlay, graded in SQL by the
 * rules in lib/parlays.ts — parlayStatus (a lost leg loses it; pushes and
 * voids drop out; nothing left is a void) and parlayPrice (the surviving legs
 * combined, rounded as decimalToAmerican rounds) — so a total over fifty
 * thousand tickets doesn't mean hydrating fifty thousand tickets in Node.
 */
export async function getUserParlayTotals(): Promise<UserParlayTotals> {
  const [r] = await db.execute<Record<string, number>>(sql`
    with legs as (
      select l.parlay_id, p.price, p.status from parlay_legs l join picks p on p.id = l.pick_id
      union all
      select l.parlay_id, s.price, s.status from parlay_selection_legs l join selections s on s.id = l.selection_id
    ),
    per as (
      select x.id, x.owner_id, x.price as book_price, x.shared,
        count(lg.parlay_id) as n_legs,
        coalesce(bool_or(lg.status = 'lost'), false) as any_lost,
        count(*) filter (where lg.status in ('won', 'lost', 'pending')) as n_live,
        count(*) filter (where lg.status = 'won') as n_won,
        -- float8, not numeric: ln/exp on numeric cost a second over 50k tickets
        exp(sum(ln(case when lg.price > 0 then 1 + lg.price / 100.0::float8 else 1 + 100.0::float8 / abs(lg.price) end))
          filter (where lg.status in ('won', 'lost', 'pending'))) as dec
      from parlays x
      join users u on u.id = x.owner_id and u.role = 'user'
      left join legs lg on lg.parlay_id = x.id
      group by x.id
    ),
    graded as (
      select per.*,
        case when n_legs = 0 or (not any_lost and n_live = 0) then 'void'
             when any_lost then 'lost'
             when n_won = n_live then 'won'
             else 'pending' end as status,
        case when n_live = 0 then null
             when book_price is not null and n_live = n_legs then book_price
             -- Math.round, which rounds .5 up, not away from zero
             when dec >= 2 then floor((dec - 1) * 100 + 0.5)
             else floor(-100 / (dec - 1) + 0.5) end as am
      from per
    )
    select
      count(*)::int as parlays,
      count(distinct owner_id)::int as builders,
      count(*) filter (where shared)::int as shared,
      avg(n_legs)::float8 as avg_legs,
      count(*) filter (where status = 'won')::int as wins,
      count(*) filter (where status = 'lost')::int as losses,
      count(*) filter (where status = 'void')::int as voids,
      count(*) filter (where status = 'pending')::int as pending,
      coalesce(sum(case
        when status = 'won' then case when am > 0 then am / 100.0 else 100.0 / abs(am) end
        when status = 'lost' then -1
        else 0 end), 0)::float8 as net
    from graded
  `);
  return {
    parlays: r.parlays,
    builders: r.builders,
    shared: r.shared,
    avgLegs: r.parlays > 0 ? r.avg_legs : null,
    running: r.pending,
    counts: { wins: r.wins, losses: r.losses, pushes: 0, voids: r.voids, pending: r.pending, net: r.net },
  };
}

/**
 * One page of the Community stream: shared tickets, newest slate first and,
 * within a day, newest first — so upcoming days lead, then today, then the
 * past, as on Picks. Paged by keyset on (slate_date, created_at, id) after
 * the ticket `before`, as Home pages posts, so a page boundary can fall
 * mid-day and a ticket shared while you scroll never shifts what comes next.
 *
 * `sport` narrows to tickets with a leg in that sport (and league): either
 * one of Oobee's picks, or a feed selection on a game in one of `leagues`.
 */
export async function getCommunityParlayPage({
  before,
  sport,
  leagues,
  limit,
  viewerId = null,
}: {
  /** Owners this viewer has muted or blocked (or who blocked them) are left out. */
  viewerId?: string | null;
  before: string | null;
  sport: { sport: Sport; league: string | null } | null;
  /** The feed leagues in that sport (or just the one), for selection legs. */
  leagues: string[];
  limit: number;
}): Promise<{ items: Array<{ parlay: ParlayView; ownerRole: Role }>; next: string | null }> {
  const legInSport = sport
    ? sql`(exists (select 1 from ${parlayLegs} join ${picks} on ${picks.id} = ${parlayLegs.pickId}
          where ${parlayLegs.parlayId} = ${parlays.id} and ${picks.sport} = ${sport.sport}${
            sport.league ? sql` and ${picks.league} = ${sport.league}` : sql``
          })
        or exists (select 1 from ${parlaySelectionLegs} join ${selections} on ${selections.id} = ${parlaySelectionLegs.selectionId}
          join ${games} on ${games.id} = ${selections.gameId}
          where ${parlaySelectionLegs.parlayId} = ${parlays.id} and ${
            leagues.length ? inArray(games.league, leagues) : sql`false`
          }))`
    : undefined;
  const after = before
    ? sql`(${parlays.slateDate}, ${parlays.createdAt}, ${parlays.id}) <
        (select c.slate_date, c.created_at, c.id from ${parlays} c where c.id = ${before})`
    : undefined;

  const rows = await db
    .select({
      ...PARLAY_COLUMNS,
      ownerEmail: sql<string | null>`null`,
      ownerUsername: users.username,
      ownerDisplayName: users.displayName,
      ownerAvatarId: users.avatarId,
      ownerRole: users.role,
    })
    .from(parlays)
    .innerJoin(users, eq(users.id, parlays.ownerId))
    .where(and(eq(parlays.shared, true), legInSport, after, visibleTo(viewerId, parlays.ownerId)))
    .orderBy(desc(parlays.slateDate), desc(parlays.createdAt), desc(parlays.id))
    .limit(limit + 1);

  const pageRows = rows.slice(0, limit);
  const views = await hydrate(pageRows);
  const roles = new Map(pageRows.map((r) => [r.id, r.ownerRole]));
  return {
    items: views.map((parlay) => ({ parlay, ownerRole: roles.get(parlay.id) ?? "user" })),
    next: rows.length > limit ? pageRows.at(-1)!.id : null,
  };
}

/** Marks which of these tickets the viewer has played (parlay_follows). One query. */
export async function markPlayed(views: ParlayView[], viewerId: string | null): Promise<ParlayView[]> {
  if (!viewerId || views.length === 0) return views;
  const rows = await db
    .select({ parlayId: parlayFollows.parlayId })
    .from(parlayFollows)
    .where(and(eq(parlayFollows.userId, viewerId), inArray(parlayFollows.parlayId, views.map((v) => v.id))));
  const played = new Set(rows.map((r) => r.parlayId));
  return views.map((v) => ({ ...v, played: played.has(v.id) }));
}

/** The parlays a tester played — someone's shared ticket, or Oobee's — newest slate first. */
export async function getPlayedParlays(userId: string): Promise<ParlayView[]> {
  const rows = await db
    .select({
      ...PARLAY_COLUMNS,
      ownerEmail: sql<string | null>`null`,
      ownerUsername: users.username,
      ownerDisplayName: users.displayName,
      ownerAvatarId: users.avatarId,
    })
    .from(parlayFollows)
    .innerJoin(parlays, eq(parlays.id, parlayFollows.parlayId))
    .leftJoin(users, eq(users.id, parlays.ownerId))
    .where(eq(parlayFollows.userId, userId))
    .orderBy(desc(parlays.slateDate), desc(parlayFollows.createdAt));
  return (await hydrate(rows)).map((v) => ({ ...v, played: true }));
}

/** Several parlays by id, graded, with who built them — for posts that carry one. */
export async function getParlaysByIds(ids: string[]): Promise<ParlayView[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({
      ...PARLAY_COLUMNS,
      ownerEmail: sql<string | null>`null`,
      ownerUsername: users.username,
      ownerDisplayName: users.displayName,
      ownerAvatarId: users.avatarId,
    })
    .from(parlays)
    .leftJoin(users, eq(users.id, parlays.ownerId))
    .where(inArray(parlays.id, ids));
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
        // The draft's picks: Oobee's parlays are built before the slate goes
        // out and are published with it (the composer locks once it has).
        eq(picks.slateDate, slateDate),
        eq(picks.status, "pending"),
        sql`${picks.startsAt} > now()`,
      ),
    )
    .orderBy(asc(picks.category), asc(picks.rank));
}
