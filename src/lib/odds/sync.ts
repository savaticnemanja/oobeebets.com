import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { games, lines, oddsSync, selections } from "@/db/schema";
import { addDays, zonedTimeToUtc } from "@/lib/slate-date";
import { FEED_LEAGUES, GAME_MARKETS, LEAGUE_CONFIG, type FeedLeague } from "./markets";

/**
 * Pulling the feed from The Odds API into games / lines, and final scores
 * into games.
 *
 * There is no background worker. Pages that need fresh data call the
 * ensure*() functions, which fetch only when the stored copy is older than
 * its TTL — and only one request does the fetching (see claim()), so a burst
 * of visitors costs the provider one call, not one each. Every credit is
 * spent because someone was about to look at the result.
 *
 * Unconfigured (no ODDS_API_KEY) every ensure*() is a no-op and the pickers
 * say the feed is off; nothing throws.
 */

/** Overridable so a test run can point at a local stand-in for the provider. */
const BASE = () => process.env.ODDS_API_BASE || "https://api.the-odds-api.com/v4";

function minutes(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Game lines: 3 credits per league per refresh. */
const ODDS_TTL_MIN = () => minutes("ODDS_TTL_MINUTES", 30);
/** Props: ~1 credit per prop market per game per refresh — the expensive one. */
const PROPS_TTL_MIN = () => minutes("PROPS_TTL_MINUTES", 120);
/** Scores: 2 credits per league per refresh, and only while a bet awaits one. */
const SCORES_TTL_MIN = () => minutes("SCORES_TTL_MINUTES", 20);

/**
 * Four books keep the cost at one region's worth (the provider bills each
 * group of up to ten bookmakers as one region) and cover where US testers
 * actually bet.
 */
function bookmakers(): string {
  return process.env.ODDS_BOOKMAKERS || "draftkings,fanduel,betmgm,williamhill_us";
}

export function feedConfigured(): boolean {
  return Boolean(process.env.ODDS_API_KEY);
}

/* ---------------------------------------------------------------- client */

class FeedError extends Error {}

async function call<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${BASE()}${path}`);
  url.searchParams.set("apiKey", process.env.ODDS_API_KEY ?? "");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });

  const remaining = Number(res.headers.get("x-requests-remaining"));
  const used = Number(res.headers.get("x-requests-used"));
  if (Number.isFinite(remaining) && res.headers.has("x-requests-remaining")) {
    await db
      .insert(oddsSync)
      .values({ key: "quota", syncedAt: new Date(), creditsRemaining: Math.floor(remaining), creditsUsed: Math.floor(used) || null })
      .onConflictDoUpdate({
        target: oddsSync.key,
        set: { syncedAt: new Date(), creditsRemaining: Math.floor(remaining), creditsUsed: Math.floor(used) || null },
      });
  }

  if (!res.ok) {
    // Never echo the URL: it carries the API key.
    const body = (await res.text().catch(() => "")).slice(0, 200);
    throw new FeedError(`Odds API ${res.status} on ${path}: ${body}`);
  }
  return (await res.json()) as T;
}

/**
 * Takes the right to refresh `key` if it is older than `ttlMin`. True for
 * exactly one caller per window — the update's WHERE is the lock.
 */
async function claim(key: string, ttlMin: number): Promise<boolean> {
  const rows = await db.execute<{ key: string }>(sql`
    insert into ${oddsSync} (key, synced_at) values (${key}, now())
    on conflict (key) do update set synced_at = now(), last_error = null
    where ${oddsSync.syncedAt} < now() - make_interval(mins => ${ttlMin})
    returning key
  `);
  return rows.length > 0;
}

/** A failed refresh retries after two minutes rather than a whole TTL. */
async function release(key: string, ttlMin: number, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[odds] ${key}: ${message}`);
  await db
    .update(oddsSync)
    .set({
      syncedAt: sql`now() - make_interval(mins => ${Math.max(0, ttlMin - 2)})`,
      lastError: message.slice(0, 500),
    })
    .where(eq(oddsSync.key, key));
}

/* --------------------------------------------------------- feed payloads */

interface ApiOutcome {
  name: string;
  description?: string;
  price: number;
  point?: number;
}
interface ApiEvent {
  id: string;
  sport_key: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers?: Array<{
    key: string;
    title: string;
    last_update?: string;
    markets: Array<{ key: string; last_update?: string; outcomes: ApiOutcome[] }>;
  }>;
}
interface ApiScore {
  id: string;
  completed: boolean;
  home_team: string;
  away_team: string;
  commence_time: string;
  scores: Array<{ name: string; score: string }> | null;
}

/** American odds the database will accept (never between -100 and +100). */
function validPrice(n: number): boolean {
  return Number.isInteger(n) && (n >= 100 || n <= -100);
}

async function upsertGame(league: FeedLeague, e: ApiEvent) {
  const values = {
    id: e.id,
    league,
    sportKey: e.sport_key,
    homeTeam: e.home_team,
    awayTeam: e.away_team,
    commenceTime: new Date(e.commence_time),
    syncedAt: new Date(),
  };
  await db
    .insert(games)
    .values(values)
    .onConflictDoUpdate({
      target: games.id,
      // Kick-off can move (a rain delay, a flexed Sunday game); teams cannot.
      set: { commenceTime: values.commenceTime, syncedAt: values.syncedAt },
    });
}

/**
 * Writes one event's markets. Every existing line in the markets this fetch
 * covered is marked unavailable first, then everything the feed still offers
 * is upserted back to available — so a line the books pulled stops being
 * pickable, while any selection already made from it is untouched.
 */
async function writeLines(e: ApiEvent, marketKeys: readonly string[]) {
  const rows: Array<typeof lines.$inferInsert> = [];
  for (const b of e.bookmakers ?? []) {
    for (const m of b.markets) {
      if (!marketKeys.includes(m.key)) continue;
      for (const o of m.outcomes) {
        if (!validPrice(o.price)) continue;
        rows.push({
          gameId: e.id,
          marketKey: m.key,
          outcome: o.name,
          player: o.description ?? null,
          point: o.point === undefined || o.point === null ? null : o.point.toFixed(1),
          price: o.price,
          book: b.key,
          bookTitle: b.title,
          available: true,
          providerUpdatedAt: m.last_update ? new Date(m.last_update) : b.last_update ? new Date(b.last_update) : null,
          syncedAt: new Date(),
        });
      }
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(lines)
      .set({ available: false })
      .where(and(eq(lines.gameId, e.id), inArray(lines.marketKey, [...marketKeys])));
    // Chunked: a busy prop fetch is a few thousand rows, past what one
    // statement's parameter list comfortably holds.
    for (let i = 0; i < rows.length; i += 500) {
      await tx
        .insert(lines)
        .values(rows.slice(i, i + 500))
        .onConflictDoUpdate({
          target: [lines.gameId, lines.marketKey, lines.outcome, lines.player, lines.point, lines.book],
          set: {
            price: sql`excluded.price`,
            bookTitle: sql`excluded.book_title`,
            available: true,
            providerUpdatedAt: sql`excluded.provider_updated_at`,
            syncedAt: sql`excluded.synced_at`,
          },
        });
    }
  });
}

/* ----------------------------------------------------------------- ensure */

/** The UTC instants a slate day spans: 04:00 local to 04:00 local the next day. */
export function slateBounds(date: string): { from: Date; to: Date } {
  return {
    from: zonedTimeToUtc(`${date}T04:00`),
    to: zonedTimeToUtc(`${addDays(date, 1)}T04:00`),
  };
}

/** The provider rejects fractional seconds in its time filters. */
function isoSeconds(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Games and their game lines (moneyline, spread, total) for one slate day. */
export async function ensureSlateOdds(date: string): Promise<void> {
  if (!feedConfigured()) return;
  const { from, to } = slateBounds(date);
  // A day that is entirely over has nothing left to bet on.
  if (to.getTime() < Date.now()) return;

  await Promise.all(
    FEED_LEAGUES.map(async (league) => {
      const key = `odds:${league}:${date}`;
      if (!(await claim(key, ODDS_TTL_MIN()))) return;
      try {
        const events = await call<ApiEvent[]>(`/sports/${LEAGUE_CONFIG[league].sportKey}/odds`, {
          markets: GAME_MARKETS.join(","),
          bookmakers: bookmakers(),
          oddsFormat: "american",
          dateFormat: "iso",
          commenceTimeFrom: isoSeconds(new Date(Math.max(from.getTime(), Date.now()))),
          commenceTimeTo: isoSeconds(to),
        });
        for (const e of events) {
          await upsertGame(league, e);
          await writeLines(e, GAME_MARKETS);
        }
      } catch (err) {
        await release(key, ODDS_TTL_MIN(), err);
      }
    }),
  );
}

/** Player props for one game — fetched only when somebody opens its props. */
export async function ensureGameProps(gameId: string): Promise<void> {
  if (!feedConfigured()) return;
  const [game] = await db.select().from(games).where(eq(games.id, gameId)).limit(1);
  if (!game || game.commenceTime.getTime() <= Date.now()) return;
  const league = game.league as FeedLeague;
  const config = LEAGUE_CONFIG[league];
  if (!config) return;

  const key = `props:${gameId}`;
  if (!(await claim(key, PROPS_TTL_MIN()))) return;
  try {
    const event = await call<ApiEvent>(`/sports/${config.sportKey}/events/${gameId}/odds`, {
      markets: config.propMarkets.join(","),
      bookmakers: bookmakers(),
      oddsFormat: "american",
      dateFormat: "iso",
    });
    await writeLines(event, config.propMarkets);
    await db.update(games).set({ propsSyncedAt: new Date() }).where(eq(games.id, gameId));
  } catch (err) {
    await release(key, PROPS_TTL_MIN(), err);
  }
}

/**
 * Final scores, for leagues that have a bet waiting on one. A league is only
 * asked once one of its games with a pending selection kicked off more than
 * two hours ago — before that no game can be over, and with nothing pending
 * there is nothing to grade. Then grades everything gradable.
 */
export async function ensureScores(): Promise<void> {
  if (feedConfigured()) {
    const waiting = await db
      .selectDistinct({ league: games.league })
      .from(selections)
      .innerJoin(games, eq(games.id, selections.gameId))
      .where(
        and(
          eq(selections.status, "pending"),
          eq(games.completed, false),
          sql`${games.commenceTime} < now() - interval '2 hours'`,
          sql`${games.commenceTime} > now() - interval '3 days'`,
        ),
      );

    await Promise.all(
      waiting.map(async ({ league }) => {
        const config = LEAGUE_CONFIG[league as FeedLeague];
        if (!config) return;
        const key = `scores:${league}`;
        if (!(await claim(key, SCORES_TTL_MIN()))) return;
        try {
          const scores = await call<ApiScore[]>(`/sports/${config.sportKey}/scores`, {
            daysFrom: "3",
            dateFormat: "iso",
          });
          for (const s of scores) {
            if (!s.scores) continue;
            const home = Number(s.scores.find((x) => x.name === s.home_team)?.score);
            const away = Number(s.scores.find((x) => x.name === s.away_team)?.score);
            if (!Number.isFinite(home) || !Number.isFinite(away)) continue;
            await db
              .update(games)
              .set({ homeScore: home, awayScore: away, completed: s.completed, scoresUpdatedAt: new Date() })
              .where(eq(games.id, s.id));
          }
        } catch (err) {
          await release(key, SCORES_TTL_MIN(), err);
        }
      }),
    );
  }

  const { autoSettle } = await import("./settle");
  await autoSettle();
}

/**
 * ensureScores for a page render: a feed outage or a bad response must never
 * take down the board, so this swallows and logs instead of throwing.
 */
export async function refreshResults(): Promise<void> {
  try {
    await ensureScores();
  } catch (err) {
    console.error("[odds] refreshResults:", err);
  }
}

export interface FeedStatus {
  configured: boolean;
  creditsRemaining: number | null;
  lastError: string | null;
}

/** For /admin/slate: is the feed on, how much credit is left, did it fail. */
export async function getFeedStatus(): Promise<FeedStatus> {
  const rows = await db.select().from(oddsSync);
  const quota = rows.find((r) => r.key === "quota");
  const failed = rows
    .filter((r) => r.lastError)
    .sort((a, b) => b.syncedAt.getTime() - a.syncedAt.getTime())[0];
  return {
    configured: feedConfigured(),
    creditsRemaining: quota?.creditsRemaining ?? null,
    lastError: failed?.lastError ?? null,
  };
}
