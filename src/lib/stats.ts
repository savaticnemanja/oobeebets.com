import "server-only";
import { db } from "@/db";
import { picks } from "@/db/schema";
import type { PickStatus } from "@/db/schema";
import { sql } from "drizzle-orm";
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
