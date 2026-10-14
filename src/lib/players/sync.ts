import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { playerGameStats, playerSeasonStats, statPlayers } from "@/db/schema";
import { claim, release } from "@/lib/sync-claim";
import { fetchGameLog, fetchSeason, statsConfigured } from "./balldontlie";
import type { SeasonRow } from "./bdl-map";
import { LEAGUE_BY_NAME, currentSeason, seasonPhase, type SeasonType, type StatLeague } from "./catalog";

/**
 * Pulling player stats from the provider into stat_players /
 * player_season_stats / player_game_stats — the same arrangement as the odds
 * feed (lib/odds/sync.ts): each slice is claimed in odds_sync before it is
 * fetched, so the poller and a page view never fetch the same thing twice.
 */

function minutes(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * A season still being played: refetched this often. NHL's table is a call
 * per player, so it refreshes half as often.
 */
const LIVE_TTL_MIN = (league: StatLeague) => minutes("STATS_TTL_MINUTES", 360) * (league === "NHL" ? 2 : 1);

/** A finished season doesn't change; a month is a long enough check. */
const FINAL_TTL_MIN = 30 * 24 * 60;

/**
 * How long a season's numbers stay good, or null when there is nothing to
 * fetch yet — the playoffs of a season whose regular season is still on.
 */
export function seasonTtl(league: StatLeague, season: number, type: SeasonType, now = new Date()): number | null {
  const cfg = LEAGUE_BY_NAME[league];
  if (season > currentSeason(cfg, now)) return null;
  if (season < currentSeason(cfg, now)) return FINAL_TTL_MIN;
  const phase = seasonPhase(cfg, now);
  if (phase === "over") return FINAL_TTL_MIN;
  // Before kick-off the feed is empty, and an empty answer stores nothing —
  // so asking at the live pace costs a call a few times a day, no more.
  if (type === "regular") return LIVE_TTL_MIN(league);
  return phase === "postseason" ? LIVE_TTL_MIN(league) : null;
}

/** Ids as /players/<league>/<id> links carry them: "nba:246". */
export function statPlayerId(league: StatLeague, providerId: string): string {
  return `${league.toLowerCase()}:${providerId}`;
}

/**
 * Brings one league's season up to date if it is due. Returns how many
 * players it stored, or null when it didn't fetch (not due, someone else is,
 * not configured, or the provider failed — which is logged and retried in a
 * couple of minutes).
 */
export async function ensureSeason(league: StatLeague, season: number, type: SeasonType): Promise<number | null> {
  if (!statsConfigured()) return null;
  const ttl = seasonTtl(league, season, type);
  if (ttl === null) return null;
  const key = `stats:${league}:${season}:${type}`;
  if (!(await claim(key, ttl))) return null;
  try {
    const rows = await fetchSeason(league, season, type);
    // Empty means not started (or the feed had a bad moment): keep what's there.
    if (rows.length === 0) return 0;
    await storeSeason(league, season, type, rows, season === currentSeason(LEAGUE_BY_NAME[league]));
    console.log(`[stats] ${league} ${season} ${type}: ${rows.length} players`);
    return rows.length;
  } catch (err) {
    await release(key, ttl, err, "stats");
    return null;
  }
}

async function storeSeason(league: StatLeague, season: number, type: SeasonType, rows: SeasonRow[], current: boolean) {
  // One row per player: a feed that lists someone twice keeps the fuller line.
  const byPlayer = new Map<string, SeasonRow>();
  for (const r of rows) {
    const seen = byPlayer.get(r.providerId);
    if (!seen || (r.gamesPlayed ?? 0) > (seen.gamesPlayed ?? 0)) byPlayer.set(r.providerId, r);
  }
  const unique = [...byPlayer.values()];

  await db.transaction(async (tx) => {
    for (let i = 0; i < unique.length; i += 500) {
      const chunk = unique.slice(i, i + 500);
      const values = chunk.map((r) => ({
        id: statPlayerId(league, r.providerId),
        league,
        providerId: r.providerId,
        name: r.name,
        teamAbbr: r.teamAbbr,
        position: r.position,
        jersey: r.jersey,
        updatedAt: new Date(),
      }));
      // Only this season's sync says where a player is now; an old season
      // fills in players we've never seen but doesn't move anyone back.
      await tx
        .insert(statPlayers)
        .values(values)
        .onConflictDoUpdate({
          target: statPlayers.id,
          set: current
            ? {
                name: sql`excluded.name`,
                teamAbbr: sql`coalesce(excluded.team_abbr, ${statPlayers.teamAbbr})`,
                position: sql`coalesce(excluded.position, ${statPlayers.position})`,
                jersey: sql`coalesce(excluded.jersey, ${statPlayers.jersey})`,
                updatedAt: sql`excluded.updated_at`,
              }
            : { name: sql`excluded.name` },
        });
    }

    await tx
      .delete(playerSeasonStats)
      .where(
        and(
          eq(playerSeasonStats.league, league),
          eq(playerSeasonStats.season, season),
          eq(playerSeasonStats.seasonType, type),
        ),
      );
    for (let i = 0; i < unique.length; i += 500) {
      await tx.insert(playerSeasonStats).values(
        unique.slice(i, i + 500).map((r) => ({
          league,
          season,
          seasonType: type,
          playerId: statPlayerId(league, r.providerId),
          teamAbbr: r.teamAbbr,
          gamesPlayed: r.gamesPlayed,
          stats: r.stats,
          syncedAt: new Date(),
        })),
      );
    }
  });
}

/**
 * One player's games in a season, fetched when someone opens their page.
 * Same claim rules as a season: live while it's being played, final after.
 */
export async function ensureGameLog(playerId: string, season: number): Promise<void> {
  if (!statsConfigured()) return;
  const [player] = await db
    .select({ league: statPlayers.league, providerId: statPlayers.providerId })
    .from(statPlayers)
    .where(eq(statPlayers.id, playerId))
    .limit(1);
  if (!player || !(player.league in LEAGUE_BY_NAME)) return;
  const league = player.league as StatLeague;

  const ttl = seasonTtl(league, season, "regular") ?? FINAL_TTL_MIN;
  const key = `gamelog:${playerId}:${season}`;
  if (!(await claim(key, ttl))) return;
  try {
    const games = await fetchGameLog(league, player.providerId, season);
    await db.transaction(async (tx) => {
      await tx
        .delete(playerGameStats)
        .where(and(eq(playerGameStats.playerId, playerId), eq(playerGameStats.season, season)));
      const unique = new Map(games.map((g) => [g.gameId, g]));
      if (unique.size === 0) return;
      await tx.insert(playerGameStats).values(
        [...unique.values()].map((g) => ({
          playerId,
          gameId: g.gameId,
          season,
          seasonType: g.seasonType,
          playedAt: g.playedAt,
          teamAbbr: g.teamAbbr,
          opponentAbbr: g.opponentAbbr,
          home: g.home,
          teamScore: g.teamScore,
          opponentScore: g.opponentScore,
          stats: g.stats,
        })),
      );
    });
  } catch (err) {
    await release(key, ttl, err, "stats");
  }
}
