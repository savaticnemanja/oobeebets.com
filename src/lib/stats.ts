import "server-only";
import { db } from "@/db";
import { picks } from "@/db/schema";
import type { Pick } from "@/db/schema";
import { and, gte, sql } from "drizzle-orm";
import { pickProfit, countsTowardRate, MIN_SAMPLE_FOR_RATE } from "./settlement";
import { startOfSlateDay, slateDateString } from "./slate-date";

/**
 * Restricts any picks query to slates that have actually been published.
 * Drafts must never reach a public surface.
 */
const publishedSlate = sql`exists (
  select 1 from slates s
  where s.date = ${picks.slateDate} and s.published_at is not null
)`;

export interface WindowStats {
  label: string;
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

const EMPTY = (label: string): WindowStats => ({
  label,
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

export function summarise(label: string, rows: Pick[]): WindowStats {
  const s = EMPTY(label);
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

/** Confidence buckets, for the "how each confidence tier has done" bar. */
export interface ConfidenceBucket {
  label: string;
  min: number;
  max: number;
  wins: number;
  losses: number;
  hitRate: number | null;
  sample: number;
  sampleTooSmall: boolean;
}

const BUCKETS: Array<{ label: string; min: number; max: number }> = [
  { label: "50–60%", min: 50, max: 60 },
  { label: "60–70%", min: 60, max: 70 },
  { label: "70–80%", min: 70, max: 80 },
  { label: "80%+", min: 80, max: 101 },
];

export function bucketByConfidence(rows: Pick[]): ConfidenceBucket[] {
  return BUCKETS.map((b) => {
    const inBucket = rows.filter(
      (p) =>
        p.confidence !== null &&
        p.confidence >= b.min &&
        p.confidence < b.max &&
        countsTowardRate(p.status),
    );
    const wins = inBucket.filter((p) => p.status === "won").length;
    const sample = inBucket.length;
    return {
      ...b,
      wins,
      losses: sample - wins,
      sample,
      hitRate: sample > 0 ? wins / sample : null,
      sampleTooSmall: sample < MIN_SAMPLE_FOR_RATE,
    };
  });
}

export interface TrackRecord {
  today: WindowStats;
  week: WindowStats;
  month: WindowStats;
  overall: WindowStats;
  buckets: ConfidenceBucket[];
  /** Book-implied win rate vs actual, over rateable picks. */
  vsMarket: { impliedRate: number; actualRate: number; edge: number; sample: number } | null;
}

/**
 * One query, aggregated in memory. At the stated ceiling (30 picks/day, ~11k
 * rows/year) this is far cheaper than four round trips, and lets every window
 * share one consistent snapshot. If the pick table ever outgrows this, move to
 * a materialised view keyed by slate_date — the shape here stays identical.
 */
export async function getTrackRecord(): Promise<TrackRecord> {
  // Only published slates count toward the public record. Drafts are invisible.
  const rows = await db.select().from(picks).where(publishedSlate);

  const now = new Date();
  const todayStart = startOfSlateDay(now);
  const weekStart = new Date(todayStart);
  weekStart.setUTCDate(weekStart.getUTCDate() - 6);
  const monthStart = new Date(todayStart);
  monthStart.setUTCDate(1);

  const todayStr = slateDateString(now);
  const inWindow = (p: Pick, from: Date) => new Date(`${p.slateDate}T12:00:00Z`) >= from;

  const overall = summarise("Overall", rows);
  const record: TrackRecord = {
    today: summarise("Today", rows.filter((p) => p.slateDate === todayStr)),
    week: summarise("This week", rows.filter((p) => inWindow(p, weekStart))),
    month: summarise("This month", rows.filter((p) => inWindow(p, monthStart))),
    overall,
    buckets: bucketByConfidence(rows),
    vsMarket: null,
  };

  const rateable = rows.filter((p) => countsTowardRate(p.status));
  if (rateable.length > 0) {
    const implied =
      rateable.reduce(
        (acc, p) =>
          acc +
          (p.price > 0
            ? 100 / (p.price + 100)
            : Math.abs(p.price) / (Math.abs(p.price) + 100)),
        0,
      ) / rateable.length;
    const actual = rateable.filter((p) => p.status === "won").length / rateable.length;
    record.vsMarket = {
      impliedRate: implied,
      actualRate: actual,
      edge: actual - implied,
      sample: rateable.length,
    };
  }

  return record;
}

/** Headline numbers for the landing page strip. Cheap aggregate query. */
export async function getHeadlineStats() {
  const [row] = await db
    .select({
      wins: sql<number>`count(*) filter (where ${picks.status} = 'won')::int`,
      losses: sql<number>`count(*) filter (where ${picks.status} = 'lost')::int`,
      settled: sql<number>`count(*) filter (where ${picks.status} in ('won','lost','push'))::int`,
      netUnits: sql<number>`coalesce(sum(
        case
          when ${picks.status} = 'won' and ${picks.price} > 0
            then ${picks.units} * (${picks.price}::numeric / 100)
          when ${picks.status} = 'won' and ${picks.price} < 0
            then ${picks.units} * (100 / abs(${picks.price})::numeric)
          when ${picks.status} = 'lost' then -${picks.units}
          else 0
        end
      ), 0)::float`,
    })
    .from(picks)
    .where(
      and(
        gte(picks.slateDate, "1970-01-01"),
        publishedSlate,
      ),
    );

  const rateable = (row?.wins ?? 0) + (row?.losses ?? 0);
  return {
    wins: row?.wins ?? 0,
    losses: row?.losses ?? 0,
    settled: row?.settled ?? 0,
    netUnits: row?.netUnits ?? 0,
    winRate: rateable > 0 ? (row?.wins ?? 0) / rateable : null,
    sampleTooSmall: rateable < MIN_SAMPLE_FOR_RATE,
  };
}
