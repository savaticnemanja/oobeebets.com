import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { playerGameStats, playerSeasonStats, statPlayers, type StatPlayer } from "@/db/schema";
import type { SeasonType, StatCategory, StatLeague } from "./catalog";

/** Rows per table page — the first render, then each infinite-scroll chunk. */
export const TABLE_PAGE = 50;

export interface TableRow {
  playerId: string;
  name: string;
  position: string | null;
  teamAbbr: string | null;
  stats: Record<string, number>;
}

/** Seasons that have any rows, newest first — all the season picker offers. */
export async function getSeasons(league: StatLeague): Promise<Array<{ season: number; types: SeasonType[] }>> {
  const rows = await db
    .selectDistinct({ season: playerSeasonStats.season, type: playerSeasonStats.seasonType })
    .from(playerSeasonStats)
    .where(eq(playerSeasonStats.league, league))
    .orderBy(desc(playerSeasonStats.season));
  const out: Array<{ season: number; types: SeasonType[] }> = [];
  for (const r of rows) {
    const last = out.at(-1);
    if (last?.season === r.season) last.types.push(r.type);
    else out.push({ season: r.season, types: [r.type] });
  }
  return out;
}

/** `%` and `_` are wildcards to ILIKE; a search for "o_neal" means the letters. */
function likeEscape(q: string): string {
  return q.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/**
 * One page of a league table: the category's players for a season, sorted by
 * one stat (missing values last, then by name so the order is stable across
 * pages). `qualified` keeps players with at least the category's share of
 * the table's most games or attempts.
 */
export async function getTable({
  league,
  season,
  type,
  category,
  sort,
  dir,
  qualified,
  q,
  offset,
}: {
  league: StatLeague;
  season: number;
  type: SeasonType;
  category: StatCategory;
  sort: string;
  dir: "asc" | "desc";
  qualified: boolean;
  q: string;
  offset: number;
}): Promise<{ rows: TableRow[]; next: number | null }> {
  const s = playerSeasonStats;
  const stat = (key: string) => sql`(${s.stats} ->> ${key})::numeric`;
  const inTable = and(
    eq(s.league, league),
    eq(s.season, season),
    eq(s.seasonType, type),
    sql`coalesce(${stat(category.has)}, 0) > 0`,
  );
  const { key: qKey, share } = category.qualify;
  const filters = [
    inTable,
    qualified
      ? sql`coalesce(${stat(qKey)}, 0) >= ${share} * (
          select max((x.stats ->> ${qKey})::numeric) from ${playerSeasonStats} x
          where x.league = ${league} and x.season = ${season} and x.season_type = ${type}
            and coalesce((x.stats ->> ${category.has})::numeric, 0) > 0
        )`
      : undefined,
    q ? sql`${statPlayers.name} ilike ${`%${likeEscape(q)}%`}` : undefined,
  ];

  const rows = await db
    .select({
      playerId: statPlayers.id,
      name: statPlayers.name,
      position: statPlayers.position,
      teamAbbr: s.teamAbbr,
      stats: s.stats,
    })
    .from(s)
    .innerJoin(statPlayers, eq(statPlayers.id, s.playerId))
    .where(and(...filters))
    .orderBy(
      dir === "asc" ? sql`${stat(sort)} asc nulls last` : sql`${stat(sort)} desc nulls last`,
      statPlayers.name,
      statPlayers.id,
    )
    .offset(offset)
    .limit(TABLE_PAGE + 1);

  return {
    rows: rows.slice(0, TABLE_PAGE),
    next: rows.length > TABLE_PAGE ? offset + TABLE_PAGE : null,
  };
}

export async function getPlayer(id: string): Promise<StatPlayer | null> {
  const [row] = await db.select().from(statPlayers).where(eq(statPlayers.id, id)).limit(1);
  return row ?? null;
}

/** Every season we hold for a player, newest first, both season types. */
export async function getPlayerSeasons(id: string) {
  return db
    .select({
      season: playerSeasonStats.season,
      type: playerSeasonStats.seasonType,
      teamAbbr: playerSeasonStats.teamAbbr,
      stats: playerSeasonStats.stats,
    })
    .from(playerSeasonStats)
    .where(eq(playerSeasonStats.playerId, id))
    .orderBy(desc(playerSeasonStats.season));
}

/** A player's most recent games in a season, newest first. */
export async function getGameLog(id: string, season: number, limit = 15) {
  return db
    .select()
    .from(playerGameStats)
    .where(and(eq(playerGameStats.playerId, id), eq(playerGameStats.season, season)))
    .orderBy(desc(playerGameStats.playedAt))
    .limit(limit);
}

/** When a league's numbers last came in, for the small print. */
export async function lastSynced(league: StatLeague): Promise<Date | null> {
  const [row] = await db
    .select({ at: sql<Date | null>`max(${playerSeasonStats.syncedAt})` })
    .from(playerSeasonStats)
    .where(eq(playerSeasonStats.league, league));
  return row?.at ? new Date(row.at) : null;
}
