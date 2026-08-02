/**
 * Seeds a demo-ready database: two admins, three subscribers on different
 * tiers, and 14 days of published slates with realistic settled results.
 *
 * Idempotent-ish: it clears picks/slates/subscriptions/users first, so running
 * it twice gives the same state rather than duplicates. Never run against a
 * database that has real customers.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import bcrypt from "bcryptjs";
import {
  auditLog,
  picks,
  rateLimits,
  sessions,
  settings,
  slates,
  subscriptions,
  users,
  type Market,
  type NewPick,
  type Sport,
} from "./schema";
import { addDays, slateDateString } from "../lib/slate-date";

// No default: this script deletes every row it touches. Guessing a connection
// string is exactly how a seed ends up wiping the wrong database.
function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[seed] DATABASE_URL is not set — copy .env.example to .env");
    process.exit(1);
  }
  return url;
}

/** Host and database only — never echo the password back to the terminal. */
function describeTarget(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}`;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

/**
 * main() deletes every row in nine tables, including the whole pick history —
 * which §10 of the FSD calls the company's entire asset, and which no backup
 * restores without losing a day. A stale DATABASE_URL in a shell is all it
 * takes, so seeding requires an opt-in that no deployed environment carries.
 */
function requireSeedOptIn(url: string): void {
  if (process.env.NODE_ENV === "production") {
    console.error("[seed] refusing to run: NODE_ENV=production.");
    process.exit(1);
  }
  if (process.env.ALLOW_DESTRUCTIVE_SEED !== "1") {
    console.error(
      "[seed] refusing to wipe the database.\n" +
        `       Target: ${describeTarget(url)}\n` +
        "       This deletes every user, slate, pick and audit entry.\n" +
        "       Set ALLOW_DESTRUCTIVE_SEED=1 to confirm (see .env.example).",
    );
    process.exit(1);
  }
}

const connectionString = requireDatabaseUrl();
requireSeedOptIn(connectionString);

const client = postgres(connectionString, { max: 1 });
const db = drizzle(client, {
  schema: { users, sessions, subscriptions, slates, picks, settings, auditLog, rateLimits },
});

/* --------------------------------------------------------- demo fixtures */

const GAMES: Array<{
  sport: Sport;
  league: string;
  event: string;
  market: Market;
  selection: string;
  price: number;
  book: string;
}> = [
  { sport: "basketball", league: "WNBA", event: "New York Liberty vs Las Vegas Aces", market: "total", selection: "Over 177.5", price: -118, book: "DraftKings" },
  { sport: "baseball", league: "MLB", event: "Baltimore Orioles vs Detroit Tigers", market: "total", selection: "Over 7.5", price: -107, book: "FanDuel" },
  { sport: "baseball", league: "MLB", event: "Chicago Cubs vs St. Louis Cardinals", market: "total", selection: "Over 8", price: -110, book: "DraftKings" },
  { sport: "soccer", league: "Scottish Premiership", event: "Dundee United vs Motherwell", market: "spread", selection: "Dundee United +1.5", price: -138, book: "Bet365" },
  { sport: "soccer", league: "UEFA Champions League", event: "Omonia Nicosia vs Kairat Almaty", market: "moneyline", selection: "Omonia Nicosia", price: -150, book: "Bet365" },
  { sport: "baseball", league: "MLB", event: "Texas Rangers vs Tampa Bay Rays", market: "spread", selection: "Texas Rangers +1.5", price: -167, book: "FanDuel" },
  { sport: "baseball", league: "MLB", event: "Atlanta Braves vs New York Mets", market: "spread", selection: "New York Mets +1.5", price: -136, book: "DraftKings" },
  { sport: "baseball", league: "MLB", event: "Toronto Blue Jays vs Washington Nationals", market: "spread", selection: "Washington Nationals +1.5", price: -147, book: "Caesars" },
  { sport: "soccer", league: "Eliteserien", event: "AGF vs Lech Poznan", market: "total", selection: "Over 2.5", price: -105, book: "Bet365" },
  { sport: "basketball", league: "WNBA", event: "Seattle Storm vs Phoenix Mercury", market: "spread", selection: "Seattle Storm -3.5", price: -110, book: "DraftKings" },
  { sport: "tennis", league: "ATP", event: "Fritz vs Rublev", market: "moneyline", selection: "Rublev", price: +125, book: "Bet365" },
  { sport: "tennis", league: "WTA", event: "Swiatek vs Gauff", market: "spread", selection: "Gauff +4.5 games", price: -115, book: "FanDuel" },
  { sport: "hockey", league: "NHL", event: "Colorado Avalanche vs Dallas Stars", market: "total", selection: "Under 6", price: -104, book: "DraftKings" },
  { sport: "hockey", league: "NHL", event: "Boston Bruins vs Florida Panthers", market: "moneyline", selection: "Florida Panthers", price: -132, book: "Caesars" },
  { sport: "football", league: "NFL", event: "Kansas City Chiefs vs Buffalo Bills", market: "spread", selection: "Buffalo Bills +2.5", price: -110, book: "DraftKings" },
  { sport: "football", league: "NCAAF", event: "Georgia vs Alabama", market: "total", selection: "Under 51.5", price: -108, book: "FanDuel" },
  { sport: "soccer", league: "Premier League", event: "Brighton vs Everton", market: "total", selection: "Over 2.5", price: +102, book: "Bet365" },
  { sport: "soccer", league: "La Liga", event: "Girona vs Real Betis", market: "moneyline", selection: "Girona", price: -120, book: "Bet365" },
  { sport: "basketball", league: "NBA", event: "Denver Nuggets vs Minnesota Timberwolves", market: "spread", selection: "Nuggets -4.5", price: -110, book: "DraftKings" },
  { sport: "basketball", league: "NBA", event: "Boston Celtics vs Milwaukee Bucks", market: "total", selection: "Over 224.5", price: -112, book: "FanDuel" },
];

const REASONS = [
  "Pace-up spot for both sides and the total opened two points lower at the sharpest book.",
  "Key injury on the other side hasn't moved this line yet. We're in before it does.",
  "Model has this two points off the market number; the price is the whole edge here.",
  "Bad travel spot on the second night of a back-to-back. Fade the tired side.",
  "Line moved against the public money — that's usually the side worth being on.",
  "Both teams top-six in scoring rate and the total is priced like a defensive game.",
];

/** Deterministic PRNG so repeated seeds produce an identical, explicable record. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260729);

/**
 * Slate dates come from the app's betting-day calendar, never the UTC one.
 *
 * A betting day starts at 04:00 in SLATE_TIMEZONE — eight hours behind UTC for
 * America/New_York — so between 00:00 and 08:00 UTC the UTC calendar date is a
 * day ahead of the slate the site actually serves. Seeding on UTC dates put the
 * newest slate one day into the future for that whole window: the demo's "live
 * board" was yesterday's fully-settled slate, and the verify suite sized its
 * expectations from a slate the app had never rendered.
 */
const TODAY = slateDateString();

function dateStr(daysAgo: number): string {
  return addDays(TODAY, -daysAgo);
}

async function main() {
  console.log("[seed] clearing existing data...");
  await db.delete(auditLog);
  await db.delete(rateLimits);
  await db.delete(picks);
  await db.delete(slates);
  await db.delete(subscriptions);
  await db.delete(sessions);
  await db.delete(users);
  await db.delete(settings);

  /* ------------------------------------------------------------- users */

  const password = await bcrypt.hash("password123", 12);

  console.log("[seed] creating users...");
  const created = await db
    .insert(users)
    .values([
      { email: "owner@oobeebets.com", passwordHash: password, role: "owner", emailVerifiedAt: new Date() },
      { email: "admin@oobeebets.com", passwordHash: password, role: "admin", emailVerifiedAt: new Date() },
      { email: "elite@example.com", passwordHash: password, role: "user", emailVerifiedAt: new Date() },
      { email: "pro@example.com", passwordHash: password, role: "user", emailVerifiedAt: new Date() },
      { email: "base@example.com", passwordHash: password, role: "user", emailVerifiedAt: new Date() },
      { email: "free@example.com", passwordHash: password, role: "user" },
    ])
    .returning({ id: users.id, email: users.email });

  const byEmail = new Map(created.map((u) => [u.email, u.id]));
  const ownerId = byEmail.get("owner@oobeebets.com")!;

  const periodEnd = new Date();
  periodEnd.setDate(periodEnd.getDate() + 21);

  await db.insert(subscriptions).values([
    { userId: byEmail.get("elite@example.com")!, tier: "elite", status: "active", priceCents: 19900, currentPeriodEnd: periodEnd, stripeSubscriptionId: "seed_sub_elite" },
    { userId: byEmail.get("pro@example.com")!, tier: "pro", status: "active", priceCents: 7900, currentPeriodEnd: periodEnd, stripeSubscriptionId: "seed_sub_pro" },
    { userId: byEmail.get("base@example.com")!, tier: "base", status: "active", priceCents: 4900, currentPeriodEnd: periodEnd, stripeSubscriptionId: "seed_sub_base" },
  ]);

  /* ---------------------------------------------------------- settings */

  await db.insert(settings).values([
    { key: "trialsEnabled", value: true, updatedBy: ownerId },
    { key: "seatCap", value: 1000, updatedBy: ownerId },
    { key: "pricing", value: { base: 4900, pro: 9900, elite: 19900 }, updatedBy: ownerId },
    { key: "nextPriceRiseAt", value: dateStr(-14), updatedBy: ownerId },
  ]);

  /* ------------------------------------------------------------ slates */

  console.log("[seed] building 14 days of slates...");
  const DAYS = 14;
  let totalPicks = 0;

  for (let d = DAYS - 1; d >= 0; d--) {
    const date = dateStr(d);
    const isToday = d === 0;

    await db.insert(slates).values({
      date,
      // Today's slate is published too, so the demo has a live board.
      publishedAt: new Date(),
      publishedBy: ownerId,
    });

    // Between 18 and 30 picks a day — real slates are not always full.
    const count = isToday ? 24 : 18 + Math.floor(rand() * 13);
    const rows: NewPick[] = [];

    for (let rank = 1; rank <= count; rank++) {
      const g = GAMES[Math.floor(rand() * GAMES.length)];

      const hourRoll = Math.floor(rand() * 8);
      const minuteRoll = Math.floor(rand() * 4) * 15;

      // Past slates get an evening window on their own date. Today's is
      // anchored on the current moment instead: a betting day is not a UTC day,
      // so a fixed 16:00–23:59 UTC window can sit entirely in the past by the
      // time the slate is served, leaving the "live" board fully settled with
      // nothing left to bet — or to settle, which is what the e2e suite needs.
      let startsAt: Date;
      if (isToday) {
        startsAt = new Date(
          Date.now() + (hourRoll - 3) * 3600_000 + minuteRoll * 60_000,
        );
      } else {
        startsAt = new Date(`${date}T12:00:00Z`);
        startsAt.setUTCHours(16 + hourRoll, minuteRoll);
      }

      // Confidence decays down the board: rank 1 is the best play of the day.
      const confidence = Math.round(82 - (rank / count) * 26 + rand() * 6);

      let status: NewPick["status"] = "pending";
      let finalScore: string | null = null;
      let settledAt: Date | null = null;

      if (!isToday || startsAt < new Date()) {
        const roll = rand();

        // Win chance is derived from the price, not fixed. A flat 55% looks
        // fine but loses money on a board of -140 favourites, which is exactly
        // the trap this product exists to expose. Model it the honest way:
        // beat the book's implied probability by a few points, more on the
        // higher-confidence picks. That yields a small positive ROI, which is
        // what a real edge looks like — not a highlight reel.
        const implied =
          g.price > 0
            ? 100 / (g.price + 100)
            : Math.abs(g.price) / (Math.abs(g.price) + 100);
        const edge = 0.02 + ((confidence - 60) / 100) * 0.1;
        const winChance = Math.min(0.93, Math.max(0.15, implied + edge));

        if (roll < 0.03) {
          status = "void";
        } else if (roll < 0.07) {
          status = "push";
        } else {
          status = rand() < winChance ? "won" : "lost";
        }
        finalScore =
          status === "void"
            ? null
            : `${Math.floor(rand() * 6)}-${Math.floor(rand() * 6)}`;
        settledAt = new Date(startsAt.getTime() + 3 * 60 * 60 * 1000);
      }

      rows.push({
        slateDate: date,
        rank,
        sport: g.sport,
        league: g.league,
        event: g.event,
        startsAt,
        market: g.market,
        selection: g.selection,
        price: g.price,
        book: g.book,
        units: "1.00",
        confidence,
        evPct: String((rand() * 24 + 2).toFixed(1)),
        reasoning: rank <= 8 ? REASONS[Math.floor(rand() * REASONS.length)] : null,
        status,
        finalScore,
        settledAt,
        settledBy: settledAt ? ownerId : null,
        voidReason: status === "void" ? "Game postponed — no action." : null,
      });
    }

    await db.insert(picks).values(rows);
    totalPicks += rows.length;
  }

  await db.insert(auditLog).values({
    actorId: ownerId,
    actorEmail: "owner@oobeebets.com",
    action: "seed.completed",
    entity: "system",
    meta: { days: DAYS, picks: totalPicks },
  });

  console.log(`[seed] done — ${created.length} users, ${DAYS} slates, ${totalPicks} picks`);
  console.log("");
  console.log("  Sign in with any of these (password: password123)");
  console.log("    owner@oobeebets.com   owner  — full admin incl. user roles");
  console.log("    admin@oobeebets.com   admin  — publish + settle, no role management");
  console.log("    elite@example.com     elite  — all 30 picks");
  console.log("    pro@example.com       pro    — top 15");
  console.log("    base@example.com      base   — top 6");
  console.log("    free@example.com      free   — top pick only");
  console.log("");

  await client.end();
}

main().catch(async (err) => {
  console.error("[seed] failed:", err);
  await client.end();
  process.exit(1);
});
