import "server-only";
import {
  categoryFromParam,
  defaultDir,
  dirFromParam,
  leagueFromParam,
  currentSeason,
  seasonTypeFromParam,
  sortFromParam,
  type LeagueConfig,
  type SeasonType,
  type StatCategory,
  type StatColumn,
} from "@/lib/players/catalog";
import { getTable } from "@/lib/players/queries";
import { PlayerLead, type GridRow } from "@/components/players/stats-grid";

/**
 * What a /players URL means, in one place: the page reads it, and so does the
 * infinite-scroll action (app/actions/feeds.tsx), which gets the page's
 * canonical query back and must land on exactly the same table.
 */

export type PlayersParams = Partial<Record<"sport" | "season" | "type" | "cat" | "sort" | "dir" | "all" | "q", string>>;

export interface PlayersView {
  league: LeagueConfig;
  category: StatCategory;
  type: SeasonType;
  season: number;
  sort: StatColumn;
  dir: "asc" | "desc";
  /** Leader-board minimum on (the default) or everyone ("All players"). */
  qualified: boolean;
  q: string;
}

/**
 * Reads the params against the seasons we hold. A season we don't have falls
 * back to the newest with rows of this type — so in October, before tip-off,
 * the NBA opens on last season rather than an empty table.
 */
export function resolveView(params: PlayersParams, seasons: Array<{ season: number; types: SeasonType[] }>): PlayersView {
  const league = leagueFromParam(params.sport);
  const category = categoryFromParam(league, params.cat);
  const type = seasonTypeFromParam(params.type);
  const sort = sortFromParam(category, params.sort);
  const asked = Number(params.season);
  const season =
    seasons.find((s) => s.season === asked)?.season ??
    seasons.find((s) => s.types.includes(type))?.season ??
    seasons[0]?.season ??
    currentSeason(league);
  return {
    league,
    category,
    type,
    season,
    sort,
    dir: dirFromParam(sort, params.dir),
    qualified: params.all !== "1",
    q: (params.q ?? "").trim().slice(0, 60),
  };
}

/**
 * A /players link: the view with some of it changed. Defaults are left out,
 * so the plain links stay plain. Changing league starts over, since seasons
 * and columns mean something else there; changing table resets the sort.
 */
export function playersHref(view: PlayersView, change: Partial<Omit<PlayersView, "league">> = {}): string {
  const v = { ...view, ...change };
  if (change.category && change.category.key !== view.category.key && !change.sort) {
    v.sort = sortFromParam(change.category, undefined);
    v.dir = defaultDir(v.sort);
  }
  const p = new URLSearchParams({ sport: v.league.key, season: String(v.season) });
  if (v.type !== "regular") p.set("type", v.type);
  if (v.category.key !== v.league.categories[0].key) p.set("cat", v.category.key);
  if (v.sort.key !== v.category.sort || v.dir !== defaultDir(v.sort)) {
    p.set("sort", v.sort.key);
    p.set("dir", v.dir);
  }
  if (!v.qualified) p.set("all", "1");
  if (v.q) p.set("q", v.q);
  return `/players?${p}`;
}

/** The sort a header click asks for: its column best-first, or the current one flipped. */
export function sortHref(view: PlayersView, key: string): string {
  const column = view.category.columns.find((c) => c.key === key) ?? view.sort;
  const dir = column.key === view.sort.key ? (view.dir === "asc" ? "desc" : "asc") : defaultDir(column);
  return playersHref(view, { sort: column, dir });
}

/** A player's page, carrying the season and season type you were looking at. */
export function playerHref(playerId: string, season: number, type: SeasonType): string {
  const [league, id] = playerId.split(":");
  const p = new URLSearchParams({ season: String(season) });
  if (type !== "regular") p.set("type", type);
  return `/players/${league}/${encodeURIComponent(id)}?${p}`;
}

/** One page of the table as grid rows, numbered from `offset`. */
export async function tableRows(view: PlayersView, offset: number): Promise<{ rows: GridRow[]; next: number | null }> {
  const { rows, next } = await getTable({
    league: view.league.league,
    season: view.season,
    type: view.type,
    category: view.category,
    sort: view.sort.key,
    dir: view.dir,
    qualified: view.qualified,
    q: view.q,
    offset,
  });
  return {
    rows: rows.map((r, i) => {
      const href = playerHref(r.playerId, view.season, view.type);
      return {
        id: r.playerId,
        href,
        // A search narrows the list, so a position in it isn't a rank.
        rank: view.q ? undefined : offset + i + 1,
        lead: <PlayerLead href={href} name={r.name} team={r.teamAbbr} position={r.position} />,
        stats: r.stats,
      };
    }),
    next,
  };
}
