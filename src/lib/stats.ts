import "server-only";
import { db } from "@/db";
import { pickFollows, picks, users } from "@/db/schema";
import type { Market, PickCategory, PickStatus } from "@/db/schema";
import { and, asc, eq, sql } from "drizzle-orm";
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

/** A tester follow, joined to the pick it points at. One row per tap. */
interface FollowRow {
  userId: string;
  email: string;
  takenAt: Date;
  category: PickCategory;
  market: Market;
  league: string;
  price: number;
  status: PickStatus;
}

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

export interface FollowAnalytics {
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
  byCategory: FollowBreakdown[];
  byMarket: FollowBreakdown[];
  byLeague: FollowBreakdown[];
  /** Per tester, most engaged first. Capped — beta is a small room. */
  testerRows: TesterFollowRow[];
  /** Two halves of the cohort, or empty when there are too few to halve. */
  byConsistency: ConsistencySplit[];
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
 * "Do testers who follow Oobee more consistently perform differently?" — the
 * cohort halved at its median consistency, each half summarised.
 *
 * Only testers who have followed something are in the split. Accounts that
 * have never ticked a box are the answer to a different question ("how many
 * testers engaged at all", which the `followers` figure covers); leaving them
 * in would drag the median to zero and turn this into "followed anything vs
 * followed a lot".
 *
 * Returns nothing below MIN_SPLIT followers. A two-against-two comparison of
 * win rates is not a finding, and printing one as though it were is exactly
 * what MIN_SAMPLE_FOR_RATE exists to prevent elsewhere.
 */
const MIN_SPLIT = 4;

function splitByConsistency(
  perTester: TesterFollowRow[],
  byUser: Map<string, FollowRow[]>,
): ConsistencySplit[] {
  const ranked = perTester
    .filter((u) => u.follows > 0 && u.consistency !== null)
    .sort((a, b) => a.consistency! - b.consistency!);

  if (ranked.length < MIN_SPLIT) return [];

  const mid = Math.floor(ranked.length / 2);
  const halves: [string, TesterFollowRow[]][] = [
    ["Follows less often", ranked.slice(0, mid)],
    ["Follows more often", ranked.slice(mid)],
  ];

  return halves.map(([label, group]) => {
    const rows = group.flatMap((u) => byUser.get(u.userId) ?? []);
    return {
      label,
      testers: group.length,
      follows: rows.length,
      // The group's own mean consistency, which is what the label is about.
      consistency:
        group.length > 0
          ? group.reduce((n, u) => n + (u.consistency ?? 0), 0) / group.length
          : null,
      record: summarise(asBetaRows(rows)),
    };
  });
}

const TESTER_ROWS_LIMIT = 200;

/** Flat-staked view of a follow, in the shape the unit maths takes. */
function asBetaRows(rows: FollowRow[]): RecordRow[] {
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

/**
 * Builds one breakdown table. `pickCounts` is what was published per slice —
 * it has to come from the picks table rather than from the follows, or a slice
 * nobody followed would vanish instead of showing a zero.
 */
function breakdown<K extends string>(
  follows: FollowRow[],
  pickCounts: Map<K, number>,
  keyOf: (r: FollowRow) => K,
  label: (k: K) => string,
): FollowBreakdown[] {
  const grouped = bucket(follows, keyOf);
  const totalPicks = [...pickCounts.values()].reduce((n, v) => n + v, 0);
  const totalFollows = follows.length;

  return [...new Set([...pickCounts.keys(), ...grouped.keys()])]
    .map((k) => {
      const rows = grouped.get(k) ?? [];
      const picks = pickCounts.get(k) ?? 0;
      const pickShare = totalPicks > 0 ? picks / totalPicks : 0;
      return {
        key: k,
        label: label(k),
        picks,
        follows: rows.length,
        lift:
          totalFollows > 0 && pickShare > 0
            ? rows.length / totalFollows / pickShare
            : null,
        record: summarise(asBetaRows(rows)),
      };
    })
    .sort((a, b) => b.follows - a.follows || b.picks - a.picks);
}

/**
 * Everything /admin/follows renders, from four queries.
 *
 * The follow rows are fetched once and sliced in memory rather than asked for
 * per breakdown, for the same reason getTrackRecord sums in memory: every
 * figure on the page then comes off one consistent snapshot, and at the stated
 * ceiling — thirty picks a day against a closed beta's worth of accounts —
 * one narrow scan is cheaper than six group-bys. The escape hatch is the same
 * one: if this table outgrows the approach, a materialised view keyed by
 * (slate_date, user_id) slots in behind this signature unchanged.
 */
export async function getFollowAnalytics(): Promise<FollowAnalytics> {
  const [oobee, followRows, pickCounts, testerRows] = await Promise.all([
    getTrackRecord(),

    db
      .select({
        userId: pickFollows.userId,
        email: users.email,
        takenAt: pickFollows.createdAt,
        category: picks.category,
        market: picks.market,
        league: picks.league,
        price: picks.price,
        status: picks.status,
      })
      .from(pickFollows)
      .innerJoin(users, and(eq(users.id, pickFollows.userId), TESTER))
      .innerJoin(picks, eq(picks.id, pickFollows.pickId))
      .where(publishedSlate),

    // What was on offer, by every slice the page breaks down. One group-by
    // covers all three dimensions; they are summed apart below.
    db
      .select({
        category: picks.category,
        market: picks.market,
        league: picks.league,
        n: sql<number>`count(*)::int`,
      })
      .from(picks)
      .where(publishedSlate)
      .groupBy(picks.category, picks.market, picks.league),

    // Per-tester opportunity count, correlated so a tester is only measured
    // against the picks that were still takeable once they had an account.
    //
    // The outer column is written as `${users}.created_at`, not as the column
    // object. Drizzle drops the table qualifier from a select on a single
    // unjoined table, and bare `created_at` inside this subquery is ambiguous
    // three ways — picks, slates and users all have one — which Postgres
    // rejects outright (42702). Naming the table keeps the reference pointing
    // at the row being measured.
    db
      .select({
        userId: users.id,
        email: users.email,
        opportunities: sql<number>`(
          select count(*)::int from picks p
          join slates s on s.date = p.slate_date and s.published_at is not null
          where p.starts_at > ${users}.created_at
        )`,
      })
      .from(users)
      .where(TESTER)
      .orderBy(users.email)
      .limit(TESTER_ROWS_LIMIT),
  ]);

  const sumBy = <K extends string>(keyOf: (r: (typeof pickCounts)[number]) => K) => {
    const out = new Map<K, number>();
    for (const r of pickCounts) {
      const k = keyOf(r);
      out.set(k, (out.get(k) ?? 0) + r.n);
    }
    return out;
  };

  const byUser = bucket(followRows, (r) => r.userId);

  // `t` is the i18n catalogue in this file, so the per-tester row is `u`.
  const perTester = testerRows.map((u): TesterFollowRow => {
    const rows = byUser.get(u.userId) ?? [];
    return {
      userId: u.userId,
      email: u.email,
      follows: rows.length,
      opportunities: u.opportunities,
      consistency: u.opportunities > 0 ? rows.length / u.opportunities : null,
      record: summarise(asBetaRows(rows)),
      lastFollowAt: rows.reduce<Date | null>(
        (latest, r) => (latest === null || r.takenAt > latest ? r.takenAt : latest),
        null,
      ),
    };
  });

  const opportunities = testerRows.reduce((n, u) => n + u.opportunities, 0);

  return {
    testers: testerRows.length,
    followers: byUser.size,
    follows: followRows.length,
    opportunities,
    takeRate: opportunities > 0 ? followRows.length / opportunities : null,
    avgPerFollower: byUser.size > 0 ? followRows.length / byUser.size : null,
    oobee,
    beta: summarise(asBetaRows(followRows)),
    byCategory: breakdown(
      followRows,
      sumBy((r) => r.category),
      (r) => r.category,
      (k) => CATEGORY_LABELS[k],
    ),
    byMarket: breakdown(
      followRows,
      sumBy((r) => r.market),
      (r) => r.market,
      (k) => t().market[k],
    ),
    byLeague: breakdown(
      followRows,
      sumBy((r) => r.league),
      (r) => r.league,
      (k) => k,
    ),
    byConsistency: splitByConsistency(perTester, byUser),
    testerRows: perTester.sort(
      (a, b) => b.follows - a.follows || a.email.localeCompare(b.email),
    ),
  };
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
