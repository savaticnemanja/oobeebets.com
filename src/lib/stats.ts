import "server-only";
import { db } from "@/db";
import { pickFollows, picks, slates, users } from "@/db/schema";
import type { Market, PickCategory, PickStatus, Role } from "@/db/schema";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { CATEGORY_LABELS } from "./board";
import { FOLLOW_STAKE_UNITS } from "./follows";
import { t } from "./i18n";
import { pickProfit, MIN_SAMPLE_FOR_RATE } from "./settlement";

/**
 * Restricts any picks query to slates that have actually been published.
 * Drafts must never reach a public surface.
 */
const publishedSlate = sql`exists (
  select 1 from slates s
  where s.date = ${picks.slateDate} and s.published_at is not null
)`;

/** The three columns the record is arithmetic over, and nothing else. */
interface RecordRow {
  price: number;
  units: string;
  status: PickStatus;
}

export interface TrackRecord {
  wins: number;
  losses: number;
  pushes: number;
  voids: number;
  pending: number;
  settled: number;
  netUnits: number;
  /** null when the sample is too small to quote — do not print a number. */
  winRate: number | null;
  sampleTooSmall: boolean;
  roi: number | null;
}

const EMPTY = (): TrackRecord => ({
  wins: 0,
  losses: 0,
  pushes: 0,
  voids: 0,
  pending: 0,
  settled: 0,
  netUnits: 0,
  winRate: null,
  sampleTooSmall: true,
  roi: null,
});

function summarise(rows: RecordRow[]): TrackRecord {
  const s = EMPTY();
  let stakedOnSettled = 0;

  for (const p of rows) {
    switch (p.status) {
      case "won":
        s.wins++;
        break;
      case "lost":
        s.losses++;
        break;
      case "push":
        s.pushes++;
        break;
      case "void":
        s.voids++;
        break;
      case "pending":
        s.pending++;
        continue;
    }
    // Voids are excluded from every rate and from staked volume: they never
    // happened as far as the record is concerned.
    if (p.status === "void") continue;

    s.settled++;
    s.netUnits += pickProfit(p);
    stakedOnSettled += Number(p.units);
  }

  const rateable = s.wins + s.losses;
  s.sampleTooSmall = rateable < MIN_SAMPLE_FOR_RATE;
  s.winRate = rateable > 0 ? s.wins / rateable : null;
  s.roi = stakedOnSettled > 0 ? s.netUnits / stakedOnSettled : null;

  return s;
}

/**
 * The published record, all time.
 *
 * One query, summed in memory. At the stated ceiling (15 picks/day, ~5.5k
 * rows/year) that is cheaper than asking Postgres for each figure separately,
 * and every number here comes off one consistent snapshot. If the pick table
 * ever outgrows it, move to a materialised view keyed by slate_date — the
 * shape this returns stays identical.
 *
 * Only the three columns the maths reads are selected. Windowed slices (today,
 * this week, confidence buckets, book-implied vs actual) lived here until the
 * public statistics page was dropped; they are in git if that page returns,
 * rather than sitting here being computed for nobody.
 */
export async function getTrackRecord(): Promise<TrackRecord> {
  // Only published slates count toward the public record. Drafts are invisible.
  const rows = await db
    .select({ price: picks.price, units: picks.units, status: picks.status })
    .from(picks)
    .where(publishedSlate);

  return summarise(rows);
}

/* --------------------------------------------------- beta user performance */

/**
 * The second dataset: not how Oobee's picks did, but how the picks testers
 * actually took did.
 *
 * Both halves are computed from the same rows by the same `summarise`, with
 * exactly one difference — the stake. Oobee's record uses the units Oobee
 * called; the beta record is flat at FOLLOW_STAKE_UNITS, because what a tester
 * risked was never collected and borrowing Oobee's number would make the beta
 * record a rescaled copy of the thing it is supposed to be compared against.
 * See lib/follows.ts.
 *
 * The cohort is non-admin accounts. Admins are the people running the beta,
 * and they tick boxes while testing the feature; their follows stay out of
 * every figure here so that "our testers went 9-7" means the testers. The
 * board still lets an admin use the control — it is just not evidence.
 */
const TESTER = eq(users.role, "user");

/**
 * How a slice of the board was followed. `lift` is the figure that answers
 * "which types of bets do users follow most": raw follow counts only say which
 * type was *published* most, so each slice's share of all follows is divided
 * by its share of all picks. 1.0 means followed exactly in proportion to how
 * often it appeared; 1.4 means forty percent over its weight.
 */
export interface FollowBreakdown {
  key: string;
  label: string;
  /** Published picks in this slice — what was on offer. */
  picks: number;
  follows: number;
  /** null when nothing has been followed at all, so there is no share to take. */
  lift: number | null;
  /** Flat-staked record of the follows in this slice. */
  record: TrackRecord;
}

/** One tester's own row in the beta dataset. */
export interface TesterFollowRow {
  userId: string;
  email: string;
  follows: number;
  /**
   * Picks this tester could have taken: published, and still ahead of kick-off
   * at the moment their account was created. Someone who joined on Tuesday is
   * not measured against Monday's board.
   */
  opportunities: number;
  /** follows / opportunities — how consistently they follow Oobee. */
  consistency: number | null;
  record: TrackRecord;
  lastFollowAt: Date | null;
}

export interface FollowSummary {
  /** Non-admin accounts. */
  testers: number;
  /** Testers who have taken at least one pick. */
  followers: number;
  follows: number;
  /** Summed per-tester opportunities — the honest denominator for takeRate. */
  opportunities: number;
  /** follows / opportunities, across the cohort. */
  takeRate: number | null;
  avgPerFollower: number | null;
  /** Oobee's own published record, at Oobee's own stakes. */
  oobee: TrackRecord;
  /** The followed picks only, flat-staked. */
  beta: TrackRecord;
  /** Two halves of the cohort, or empty when there are too few to halve. */
  byConsistency: ConsistencySplit[];
}

export interface FollowBreakdowns {
  byCategory: FollowBreakdown[];
  byMarket: FollowBreakdown[];
  byLeague: FollowBreakdown[];
}

/** One half of the cohort, split at its median follow consistency. */
export interface ConsistencySplit {
  label: string;
  testers: number;
  follows: number;
  /** The median boundary itself, so the page can say where the line fell. */
  consistency: number | null;
  record: TrackRecord;
}

/**
 * The beta dataset is summed in Postgres, not in Node. It used to fetch every
 * tester follow (300k rows at the load-test scale) and group them in
 * JavaScript, which took 1.7s and — being synchronous work in the one Node
 * process — stalled every other request while it ran (admin perf audit,
 * 2026-10-17). Each query below returns at most one row per tester.
 *
 * The cohort is the same as before: non-admin accounts (TESTER), on published
 * slates only, flat-staked at FOLLOW_STAKE_UNITS.
 */

/** A record's counts as SQL sums them: everything summarise() reads. */
export interface RecordCounts {
  wins: number;
  losses: number;
  pushes: number;
  voids: number;
  pending: number;
  /** Net units at a one-unit stake. */
  net: number;
}

/** What summarise() works out, from counts summed in SQL, at a flat stake. */
export function recordFromCounts(c: RecordCounts, stake = Number(FOLLOW_STAKE_UNITS)): TrackRecord {
  const settled = c.wins + c.losses + c.pushes;
  const rateable = c.wins + c.losses;
  const netUnits = c.net * stake;
  return {
    wins: c.wins,
    losses: c.losses,
    pushes: c.pushes,
    voids: c.voids,
    pending: c.pending,
    settled,
    netUnits,
    winRate: rateable > 0 ? c.wins / rateable : null,
    sampleTooSmall: rateable < MIN_SAMPLE_FOR_RATE,
    roi: settled > 0 ? netUnits / (settled * stake) : null,
  };
}

const ZERO: RecordCounts = { wins: 0, losses: 0, pushes: 0, voids: 0, pending: 0, net: 0 };
const addCounts = (a: RecordCounts, b: RecordCounts): RecordCounts => ({
  wins: a.wins + b.wins,
  losses: a.losses + b.losses,
  pushes: a.pushes + b.pushes,
  voids: a.voids + b.voids,
  pending: a.pending + b.pending,
  net: a.net + b.net,
});
const countsOf = (r: Record<string, unknown>): RecordCounts => ({
  wins: Number(r.wins ?? 0),
  losses: Number(r.losses ?? 0),
  pushes: Number(r.pushes ?? 0),
  voids: Number(r.voids ?? 0),
  pending: Number(r.pending ?? 0),
  net: Number(r.net ?? 0),
});

/** Tester follows on published slates, joined to the pick: `f`, `u`, `p`. */
const FOLLOWS = sql`
  pick_follows f
  join users u on u.id = f.user_id and u.role = 'user'
  join picks p on p.id = f.pick_id
  join slates s on s.date = p.slate_date and s.published_at is not null`;

/** The counts behind a record, over `p` — profitUnits at one unit, in SQL. */
const RECORD = sql`
  count(*) filter (where p.status = 'won')::int as wins,
  count(*) filter (where p.status = 'lost')::int as losses,
  count(*) filter (where p.status = 'push')::int as pushes,
  count(*) filter (where p.status = 'void')::int as voids,
  count(*) filter (where p.status = 'pending')::int as pending,
  coalesce(sum(case
    when p.status = 'won' then case when p.price > 0 then p.price / 100.0 else 100.0 / abs(p.price) end
    when p.status = 'lost' then -1
    else 0 end), 0)::float8 as net`;

/**
 * Picks a tester could have taken: published, and still ahead of kick-off
 * when their account was made. Someone who joined on Tuesday is not measured
 * against Monday's board.
 *
 * Counted here rather than per tester in SQL: a correlated count over the
 * published picks for every tester was testers × picks rows (18M at the load
 * test's 5,000 testers) and took 1.7s. The published kick-offs are a few
 * thousand numbers a season; sorted once, each tester is a binary search.
 */
async function publishedKickoffs(): Promise<number[]> {
  const rows = await db.select({ at: picks.startsAt }).from(picks).where(publishedSlate);
  return rows.map((r) => r.at.getTime()).sort((a, b) => a - b);
}

/** How many of the sorted kick-offs are after `joined`. */
function opportunitiesAfter(joined: Date, kickoffs: number[]): number {
  const t = joined.getTime();
  let lo = 0;
  let hi = kickoffs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (kickoffs[mid] > t) hi = mid;
    else lo = mid + 1;
  }
  return kickoffs.length - lo;
}

const at = (v: unknown) => (v instanceof Date ? v : new Date(v as string));

type Row = Record<string, unknown>;

/** Fewer followers than this and the consistency split is left empty. */
const MIN_SPLIT = 4;

/** How many testers there are — Pick by pick's denominator. */
export async function countTesters(): Promise<number> {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(users).where(TESTER);
  return n;
}

/**
 * Summary: the cohort's totals, both records, and the consistency split.
 *
 * The split is "do testers who follow Oobee more consistently perform
 * differently?" — followers halved at their median consistency. Only testers
 * who have followed something are in it: accounts that never ticked a box
 * answer a different question (`followers` covers it), and would drag the
 * median to zero. Nothing below MIN_SPLIT followers — a two-against-two
 * comparison of win rates is not a finding.
 */
export async function getFollowSummary(): Promise<FollowSummary> {
  const [oobee, kickoffs, joined, perFollower] = await Promise.all([
    getTrackRecord(),
    publishedKickoffs(),
    db.select({ createdAt: users.createdAt }).from(users).where(TESTER),
    db.execute<Row>(sql`
      select f.user_id, u.created_at, count(*)::int as follows, ${RECORD}
      from ${FOLLOWS}
      group by f.user_id, u.created_at`),
  ]);
  const cohort = {
    testers: joined.length,
    opportunities: joined.reduce((n, u) => n + opportunitiesAfter(u.createdAt, kickoffs), 0),
  };

  const followers = (perFollower as unknown as Row[]).map((r) => ({
    follows: Number(r.follows),
    opportunities: opportunitiesAfter(at(r.created_at), kickoffs),
    counts: countsOf(r),
  }));
  const follows = followers.reduce((n, r) => n + r.follows, 0);
  const opportunities = cohort.opportunities;

  const ranked = followers
    .filter((r) => r.opportunities > 0)
    .map((r) => ({ ...r, consistency: r.follows / r.opportunities }))
    .sort((a, b) => a.consistency - b.consistency);
  const mid = Math.floor(ranked.length / 2);
  const byConsistency: ConsistencySplit[] =
    ranked.length < MIN_SPLIT
      ? []
      : ([
          ["Follows less often", ranked.slice(0, mid)],
          ["Follows more often", ranked.slice(mid)],
        ] as const).map(([label, group]) => ({
          label,
          testers: group.length,
          follows: group.reduce((n, r) => n + r.follows, 0),
          // The group's own mean consistency, which is what the label is about.
          consistency: group.length > 0 ? group.reduce((n, r) => n + r.consistency, 0) / group.length : null,
          record: recordFromCounts(group.reduce((c, r) => addCounts(c, r.counts), ZERO)),
        }));

  return {
    testers: cohort.testers,
    followers: followers.length,
    follows,
    opportunities,
    takeRate: opportunities > 0 ? follows / opportunities : null,
    avgPerFollower: followers.length > 0 ? follows / followers.length : null,
    oobee,
    beta: recordFromCounts(followers.reduce((c, r) => addCounts(c, r.counts), ZERO)),
    byConsistency,
  };
}

/**
 * What testers follow, by board, bet type and league. `lift` is each slice's
 * share of the follows over its share of the published picks — see
 * FollowBreakdown. One group-by each side covers all three dimensions; they
 * are summed apart here.
 */
export async function getFollowBreakdowns(): Promise<FollowBreakdowns> {
  const [followed, offered] = await Promise.all([
    db.execute<Row>(sql`
      select p.category, p.market, p.league, count(*)::int as follows, ${RECORD}
      from ${FOLLOWS}
      group by 1, 2, 3`),
    db
      .select({ category: picks.category, market: picks.market, league: picks.league, n: sql<number>`count(*)::int` })
      .from(picks)
      .where(publishedSlate)
      .groupBy(picks.category, picks.market, picks.league),
  ]);
  const rows = followed as unknown as Row[];
  const totalFollows = rows.reduce((n, r) => n + Number(r.follows), 0);
  const totalPicks = offered.reduce((n, r) => n + r.n, 0);

  const slice = <K extends string>(keyOf: (r: { category: string; market: string; league: string }) => K, label: (k: K) => string) => {
    const picksBy = new Map<K, number>();
    for (const r of offered) picksBy.set(keyOf(r), (picksBy.get(keyOf(r)) ?? 0) + r.n);
    const followsBy = new Map<K, { follows: number; counts: RecordCounts }>();
    for (const r of rows) {
      const k = keyOf(r as { category: string; market: string; league: string });
      const had = followsBy.get(k) ?? { follows: 0, counts: ZERO };
      followsBy.set(k, { follows: had.follows + Number(r.follows), counts: addCounts(had.counts, countsOf(r)) });
    }
    return [...new Set([...picksBy.keys(), ...followsBy.keys()])]
      .map((k): FollowBreakdown => {
        const f = followsBy.get(k) ?? { follows: 0, counts: ZERO };
        const n = picksBy.get(k) ?? 0;
        const pickShare = totalPicks > 0 ? n / totalPicks : 0;
        return {
          key: k,
          label: label(k),
          picks: n,
          follows: f.follows,
          lift: totalFollows > 0 && pickShare > 0 ? f.follows / totalFollows / pickShare : null,
          record: recordFromCounts(f.counts),
        };
      })
      .sort((a, b) => b.follows - a.follows || b.picks - a.picks);
  };

  return {
    byCategory: slice((r) => r.category as PickCategory, (k) => CATEGORY_LABELS[k]),
    byMarket: slice((r) => r.market as Market, (k) => t().market[k]),
    byLeague: slice((r) => r.league, (k) => k),
  };
}

/**
 * One page of the per-tester table, most engaged first. Every tester is
 * counted in `total` — the table pages, the totals above it never did.
 */
export async function getTesterRows({ page = 1, size = 50 }: { page?: number; size?: number } = {}): Promise<{
  rows: TesterFollowRow[];
  total: number;
}> {
  const offset = (Math.max(1, page) - 1) * size;
  const [rows, total, kickoffs] = await Promise.all([
    db.execute<Row>(sql`
      with agg as (
        select f.user_id, count(*)::int as follows, max(f.created_at) as last, ${RECORD}
        from ${FOLLOWS}
        group by f.user_id
      )
      select u.id, u.email, u.created_at, coalesce(a.follows, 0) as follows, a.last,
        a.wins, a.losses, a.pushes, a.voids, a.pending, a.net
      from users u left join agg a on a.user_id = u.id
      where u.role = 'user'
      order by coalesce(a.follows, 0) desc, u.email asc
      limit ${size} offset ${offset}`),
    countTesters(),
    publishedKickoffs(),
  ]);
  return {
    total,
    rows: (rows as unknown as Row[]).map((r) => {
      const follows = Number(r.follows);
      const opportunities = opportunitiesAfter(at(r.created_at), kickoffs);
      return {
        userId: r.id as string,
        email: r.email as string,
        follows,
        opportunities,
        consistency: opportunities > 0 ? follows / opportunities : null,
        record: recordFromCounts(countsOf(r)),
        lastFollowAt: r.last ? at(r.last) : null,
      };
    }),
  };
}

/**
 * Flat-staked view of a follow, in the shape the unit maths takes.
 *
 * Typed by the two columns it reads rather than by a row shape, so the per-player
 * detail below can hand it its own wider row without either shape having to
 * know about the other — the same reason pickProfit is typed that way.
 */
function asBetaRows(rows: { price: number; status: PickStatus }[]): RecordRow[] {
  return rows.map((r) => ({
    price: r.price,
    units: FOLLOW_STAKE_UNITS,
    status: r.status,
  }));
}

function bucket<K extends string, T>(rows: T[], keyOf: (r: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const r of rows) {
    const k = keyOf(r);
    let list = out.get(k);
    if (!list) out.set(k, (list = []));
    list.push(r);
  }
  return out;
}

/** One pick, with how many testers said they took it. */
export interface PickTakeRate {
  id: string;
  category: PickCategory;
  rank: number;
  selection: string;
  event: string;
  league: string;
  price: number;
  status: PickStatus;
  startsAt: Date;
  takers: number;
}

/**
 * Per-pick take-up for one slate — the "% of users who took each pick" figure,
 * left as a count so the caller divides by whichever denominator it is
 * showing.
 *
 * `count(users.id)`, not `count(pick_follows.user_id)`: the join to users
 * carries the cohort filter, so counting the follow column would quietly
 * include an admin's own test ticks.
 */
export async function getSlateTakeRates(date: string): Promise<PickTakeRate[]> {
  return db
    .select({
      id: picks.id,
      category: picks.category,
      rank: picks.rank,
      selection: picks.selection,
      event: picks.event,
      league: picks.league,
      price: picks.price,
      status: picks.status,
      startsAt: picks.startsAt,
      takers: sql<number>`count(${users.id})::int`,
    })
    .from(picks)
    .leftJoin(pickFollows, eq(pickFollows.pickId, picks.id))
    .leftJoin(users, and(eq(users.id, pickFollows.userId), TESTER))
    .where(eq(picks.slateDate, date))
    .groupBy(picks.id)
    .orderBy(asc(picks.category), asc(picks.rank));
}

/* ------------------------------------------------------ one player's card */

/**
 * A single bet a tester took, with everything the pick itself says about it.
 *
 * `units` is the pick's own recommended stake and is shown for reference only
 * — it is never what the tester's record is computed at. See FOLLOW_STAKE_UNITS.
 */
export interface FollowedPick {
  pickId: string;
  slateDate: string;
  category: PickCategory;
  market: Market;
  rank: number;
  league: string;
  event: string;
  selection: string;
  price: number;
  units: string;
  status: PickStatus;
  startsAt: Date;
  finalScore: string | null;
  takenAt: Date;
}

/** One slate day's worth of a tester's bets, newest day first. */
export interface PlayerDay {
  date: string;
  picks: FollowedPick[];
  record: TrackRecord;
  /** Net units across every day up to and including this one, oldest-first. */
  cumulativeUnits: number;
}

export interface PlayerFollows {
  user: {
    id: string;
    email: string;
    role: Role;
    createdAt: Date;
    lastLoginAt: Date | null;
  };
  opportunities: number;
  consistency: number | null;
  /** Everything they have taken, settled, flat-staked. */
  record: TrackRecord;
  /** Taken and not yet graded — what is riding right now. */
  open: FollowedPick[];
  /** Settled, grouped by slate day, newest first. */
  days: PlayerDay[];
}

/**
 * One tester's complete card: what is live for them now, and every bet they
 * have taken before, day by day.
 *
 * Scoped to published slates for the same reason the cohort aggregates are —
 * so a figure here and the same figure on the summary page can never disagree
 * about which picks counted.
 *
 * Returns null for an id that is not an account, so the page can 404 rather
 * than render an empty history for somebody who does not exist.
 */
export async function getPlayerFollows(userId: string): Promise<PlayerFollows | null> {
  const [person] = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
      // Same correlated count as the cohort table, and qualified for the same
      // reason: bare `created_at` is ambiguous across picks, slates and users.
      opportunities: sql<number>`(
        select count(*)::int from picks p
        join slates s on s.date = p.slate_date and s.published_at is not null
        where p.starts_at > ${users}.created_at
      )`,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!person) return null;

  const rows: FollowedPick[] = await db
    .select({
      pickId: picks.id,
      slateDate: picks.slateDate,
      category: picks.category,
      market: picks.market,
      rank: picks.rank,
      league: picks.league,
      event: picks.event,
      selection: picks.selection,
      price: picks.price,
      units: picks.units,
      status: picks.status,
      startsAt: picks.startsAt,
      finalScore: picks.finalScore,
      takenAt: pickFollows.createdAt,
    })
    .from(pickFollows)
    .innerJoin(picks, eq(picks.id, pickFollows.pickId))
    .innerJoin(slates, eq(slates.date, picks.slateDate))
    .where(and(eq(pickFollows.userId, userId), sql`${slates.publishedAt} is not null`))
    .orderBy(desc(picks.slateDate), asc(picks.category), asc(picks.rank));

  // "Current" is the pick's own grade, not the clock: a game that kicked off an
  // hour ago is still riding as far as this tester is concerned until an admin
  // settles it, and showing it as history would be claiming a result nobody
  // has entered yet.
  const open = rows.filter((r) => r.status === "pending");
  const settled = rows.filter((r) => r.status !== "pending");

  const byDay = bucket(settled, (r) => r.slateDate);

  // Built oldest-first so the running total accumulates in the direction time
  // runs, then reversed for display — newest day at the top.
  const days: PlayerDay[] = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .reduce<PlayerDay[]>((acc, [date, picksOnDay]) => {
      const record = summarise(asBetaRows(picksOnDay));
      const previous = acc.length > 0 ? acc[acc.length - 1].cumulativeUnits : 0;
      acc.push({
        date,
        picks: picksOnDay,
        record,
        cumulativeUnits: previous + record.netUnits,
      });
      return acc;
    }, [])
    .reverse();

  return {
    user: person,
    opportunities: person.opportunities,
    consistency:
      person.opportunities > 0 ? rows.length / person.opportunities : null,
    record: summarise(asBetaRows(rows)),
    open,
    days,
  };
}

/* ------------------------------------------------- a tester's own numbers */

/**
 * What a tester sees about themselves on /stats.
 *
 * Singles and parlays are reported apart and then together, because they are
 * different bets with different variance and averaging them into one line
 * hides the thing most worth seeing — whether the parlays are paying for
 * themselves. All three are flat-staked at one unit; see FOLLOW_STAKE_UNITS.
 */
export interface MyBets {
  singles: TrackRecord;
  parlays: TrackRecord;
  combined: TrackRecord;
  /** Parlays taken, settled or not — the headline count. */
  parlayCount: number;
  openParlays: number;
}

/**
 * Summarises one tester's own betting.
 *
 * The parlay rows arrive already graded from lib/parlay-store.ts, so this
 * re-uses their derived price and status rather than re-deriving either — one
 * grading path, as everywhere else parlays are touched.
 */
export function summariseMyBets(
  singles: { price: number; status: PickStatus }[],
  parlayViews: { price: number | null; status: PickStatus }[],
): MyBets {
  const singleRows = asBetaRows(singles);

  // A parlay with no live price has no legs left to pay on; it is a void, and
  // profitUnits returns zero for it whatever price is quoted.
  const parlayRows: RecordRow[] = parlayViews.map((p) => ({
    price: p.price ?? 100,
    units: FOLLOW_STAKE_UNITS,
    status: p.status,
  }));

  return {
    singles: summarise(singleRows),
    parlays: summarise(parlayRows),
    combined: summarise([...singleRows, ...parlayRows]),
    parlayCount: parlayViews.length,
    openParlays: parlayViews.filter((p) => p.status === "pending").length,
  };
}

/** The settled singles a tester took, for their own dashboard. */
export async function getMySingles(userId: string) {
  return db
    .select({
      pickId: picks.id,
      slateDate: picks.slateDate,
      category: picks.category,
      market: picks.market,
      rank: picks.rank,
      league: picks.league,
      event: picks.event,
      selection: picks.selection,
      price: picks.price,
      units: picks.units,
      status: picks.status,
      startsAt: picks.startsAt,
      finalScore: picks.finalScore,
      takenAt: pickFollows.createdAt,
    })
    .from(pickFollows)
    .innerJoin(picks, eq(picks.id, pickFollows.pickId))
    .where(and(eq(pickFollows.userId, userId), publishedSlate))
    .orderBy(desc(picks.slateDate), asc(picks.rank));
}

/**
 * The record arithmetic, for callers that already hold their own rows —
 * parlays, say, which are graded in lib/parlay-store.ts before they get here.
 * Exported as an alias so there is still exactly one implementation.
 */
export { summarise as summariseRecord };

/**
 * The picks a tester took, whole — for drawing them as the board draws them
 * on their Stats page. Newest day first, then by kick-off.
 */
export async function getMyTakenPicks(userId: string) {
  const rows = await db
    .select({ pick: picks })
    .from(pickFollows)
    .innerJoin(picks, eq(picks.id, pickFollows.pickId))
    .where(and(eq(pickFollows.userId, userId), publishedSlate))
    .orderBy(desc(picks.slateDate), asc(picks.startsAt), asc(picks.rank));
  return rows.map((r) => r.pick);
}
