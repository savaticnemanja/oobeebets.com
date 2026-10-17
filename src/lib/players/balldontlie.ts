import "server-only";
import type { SeasonType, StatLeague } from "./catalog";
import {
  mlbGame,
  mlbGameRow,
  mlbSeasonRow,
  nbaGameRow,
  nbaSeasonRow,
  nflGameRow,
  nflSeasonRow,
  nhlGameRow,
  nhlPlayer,
  nhlSeasonRow,
  num,
  type GameRow,
  type MlbGame,
  type SeasonRow,
} from "./bdl-map";

/**
 * The player-stats provider: BALLDONTLIE (api.balldontlie.io), one key for
 * every league. Only the sync (sync.ts) calls this — pages read the database,
 * so a visitor never waits on the provider and never spends its rate limit.
 *
 * Plans are per league. NFL's season table is on the All-Star tier
 * (60 requests a minute); NBA, MLB and NHL season tables need GOAT (600).
 * Each league gets its own pace, below its tier's limit — STATS_RPM for the
 * GOAT leagues, STATS_RPM_NFL for the NFL.
 *
 * Unconfigured (no STATS_API_KEY) nothing here is called; see statsConfigured.
 */

/** Overridable so a test run can point at a local stand-in for the provider. */
const BASE = () => process.env.STATS_API_BASE || "https://api.balldontlie.io";

/** Each league's path prefix. The NBA was the original API and sits at the root. */
const PREFIX: Record<StatLeague, string> = { NBA: "/v1", NFL: "/nfl/v1", MLB: "/mlb/v1", NHL: "/nhl/v1" };

export function statsConfigured(): boolean {
  return Boolean(process.env.STATS_API_KEY);
}

function rpm(league: StatLeague): number {
  const raw = league === "NFL" ? process.env.STATS_RPM_NFL : process.env.STATS_RPM;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : league === "NFL" ? 50 : 300;
}

/* --------------------------------------------------------------- client */

class StatsError extends Error {}

/** When each league may send its next request — a spacing, not a bucket. */
const nextSlot = new Map<StatLeague, number>();

async function pace(league: StatLeague) {
  const gap = 60_000 / rpm(league);
  const now = Date.now();
  const at = Math.max(now, nextSlot.get(league) ?? 0);
  nextSlot.set(league, at + gap);
  if (at > now) await new Promise((r) => setTimeout(r, at - now));
}

type Params = Record<string, string | number | boolean | Array<string | number> | undefined>;

function url(league: StatLeague, path: string, params: Params): URL {
  const u = new URL(`${BASE()}${PREFIX[league]}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) for (const item of v) u.searchParams.append(`${k}[]`, String(item));
    else u.searchParams.set(k, String(v));
  }
  return u;
}

interface Page {
  data?: unknown;
  meta?: { next_cursor?: number | string | null };
}

/**
 * One request. A 429 waits (Retry-After, else 15s) and tries again, up to
 * three times; so does a 5xx, once. The key travels in a header, never the
 * URL, so the URL is safe to put in an error.
 */
async function call(league: StatLeague, path: string, params: Params = {}): Promise<Page> {
  const target = url(league, path, params);
  for (let attempt = 0; ; attempt++) {
    await pace(league);
    const res = await fetch(target, {
      headers: { Authorization: process.env.STATS_API_KEY ?? "" },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) return (await res.json()) as Page;

    const retryable = (res.status === 429 && attempt < 3) || (res.status >= 500 && attempt < 1);
    if (!retryable) {
      const body = (await res.text().catch(() => "")).slice(0, 200);
      throw new StatsError(`Stats API ${res.status} on ${target.pathname}: ${body}`);
    }
    const wait = Number(res.headers.get("retry-after"));
    await new Promise((r) => setTimeout(r, Number.isFinite(wait) && wait > 0 ? wait * 1000 : 15_000));
  }
}

/** Every page of a list, 100 at a time, following the cursor. */
async function all(league: StatLeague, path: string, params: Params = {}): Promise<unknown[]> {
  const out: unknown[] = [];
  let cursor: string | number | undefined;
  // A runaway cursor can't loop forever: no list here is near 500 pages.
  for (let page = 0; page < 500; page++) {
    const res = await call(league, path, { ...params, per_page: 100, cursor });
    if (Array.isArray(res.data)) out.push(...res.data);
    const next = res.meta?.next_cursor;
    if (next === null || next === undefined || next === "") break;
    cursor = next;
  }
  return out;
}

/* ---------------------------------------------------------------- teams */

interface Team {
  id: number;
  abbr: string;
  names: string[];
}

/** Teams barely change; one fetch per league per process is plenty. */
const teamCache = new Map<StatLeague, Promise<Team[]>>();

function teams(league: StatLeague): Promise<Team[]> {
  let hit = teamCache.get(league);
  if (!hit) {
    hit = all(league, "/teams").then((rows) =>
      rows.flatMap((row) => {
        const t = row as Record<string, unknown>;
        const id = num(t.id);
        const abbr = typeof t.abbreviation === "string" ? t.abbreviation : typeof t.tricode === "string" ? t.tricode : null;
        if (id === undefined || !abbr) return [];
        const names = [t.name, t.full_name, t.display_name, t.short_display_name]
          .filter((n): n is string => typeof n === "string")
          .map((n) => n.toLowerCase());
        return [{ id, abbr, names }];
      }),
    );
    // A failure shouldn't stick for the life of the process.
    hit.catch(() => teamCache.delete(league));
    teamCache.set(league, hit);
  }
  return hit;
}

/* --------------------------------------------------------------- season */

const keep = <T>(x: T | null): x is T => x !== null;

/**
 * A whole league's season — every player with numbers in it.
 *
 * NBA: one list of per-game averages. NFL: one list of totals, then a pass per
 * team to learn who played where (the totals don't say). MLB: one list. NHL:
 * the season's players, then each player's own season line — the feed has no
 * league-wide table for hockey, so this is the slow one.
 */
export async function fetchSeason(league: StatLeague, season: number, type: SeasonType): Promise<SeasonRow[]> {
  switch (league) {
    case "NBA": {
      const rows = (
        await all("NBA", "/season_averages/general", {
          season,
          season_type: type === "postseason" ? "playoffs" : "regular",
          type: "base",
        })
      )
        .map(nbaSeasonRow)
        .filter(keep);
      // The averages may not name a team; the player list does (today's team).
      const missing = rows.filter((r) => !r.teamAbbr).map((r) => r.providerId);
      if (missing.length > 0) {
        const byId = new Map<string, string>();
        for (let i = 0; i < missing.length; i += 100) {
          for (const p of await all("NBA", "/players", { player_ids: missing.slice(i, i + 100) })) {
            const o = p as { id?: unknown; team?: { abbreviation?: unknown } };
            if (typeof o.team?.abbreviation === "string") byId.set(String(o.id), o.team.abbreviation);
          }
        }
        for (const r of rows) r.teamAbbr ??= byId.get(r.providerId) ?? null;
      }
      return rows;
    }

    case "NFL": {
      const seasonTypes = [type === "postseason" ? 3 : 2];
      const totals = await all("NFL", "/season_stats", { season, season_types: seasonTypes });
      const teamOf = new Map<string, string>();
      for (const t of await teams("NFL")) {
        for (const row of await all("NFL", "/season_stats", { season, season_types: seasonTypes, team_id: t.id })) {
          const id = (row as { player?: { id?: unknown } }).player?.id;
          if (id !== undefined) teamOf.set(String(id), t.abbr);
        }
      }
      return totals
        .map((row) => nflSeasonRow(row, teamOf.get(String((row as { player?: { id?: unknown } }).player?.id)) ?? null))
        .filter(keep);
    }

    case "MLB": {
      const byName = new Map<string, string>();
      for (const t of await teams("MLB")) for (const n of t.names) byName.set(n, t.abbr);
      return (await all("MLB", "/season_stats", { season, season_type: type }))
        .map((row) => mlbSeasonRow(row, byName))
        .filter(keep);
    }

    case "NHL": {
      const players = (await all("NHL", "/players", { seasons: [season] }))
        .map((p) => nhlPlayer(p, season))
        .filter(keep);
      const rows: SeasonRow[] = [];
      for (const p of players) {
        const res = await call("NHL", `/players/${encodeURIComponent(p.id)}/season_stats`, {
          season,
          postseason: type === "postseason" ? true : undefined,
        });
        const row = nhlSeasonRow(p, res.data);
        if (row) rows.push(row);
      }
      return rows;
    }
  }
}

/* -------------------------------------------------------------- game log */

/** One player's games in a season, both regular season and playoffs. */
export async function fetchGameLog(league: StatLeague, providerId: string, season: number): Promise<GameRow[]> {
  switch (league) {
    case "NBA": {
      const byId = new Map((await teams("NBA")).map((t) => [t.id, t.abbr]));
      return (await all("NBA", "/stats", { player_ids: [providerId], seasons: [season] }))
        .map((row) => nbaGameRow(row, byId))
        .filter(keep);
    }
    case "NFL":
      return (await all("NFL", "/stats", { player_ids: [providerId], seasons: [season] })).map(nflGameRow).filter(keep);
    case "MLB": {
      // A line names its game by id only; the games come from the teams' schedules.
      const lines = await all("MLB", "/stats", { player_ids: [providerId], seasons: [season] });
      const teamIds = [...new Set(lines.map((l) => num((l as { team?: { id?: unknown } }).team?.id)).filter((id) => id !== undefined))];
      if (teamIds.length === 0) return [];
      const games = new Map<number, MlbGame>();
      for (const g of await all("MLB", "/games", { seasons: [season], team_ids: teamIds })) {
        const game = mlbGame(g);
        if (game) games.set(game.id, game);
      }
      return lines.map((l) => mlbGameRow(l, games)).filter(keep);
    }
    case "NHL":
      return (await all("NHL", "/box_scores", { player_ids: [providerId], season })).map(nhlGameRow).filter(keep);
  }
}
