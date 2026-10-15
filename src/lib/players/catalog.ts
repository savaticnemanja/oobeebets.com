/**
 * What the Players pages show: the leagues, their seasons, and for each league
 * the tables (categories) and their columns. Nothing here touches the
 * database or the network, so server pages and client components share one
 * copy — the same arrangement as lib/odds/markets.ts.
 *
 * Stat keys are ours, not the provider's. The provider mapper
 * (lib/players/bdl-map.ts) writes every number under one of these keys, so a
 * change of provider is a new mapper and nothing else.
 */
import type { Sport } from "@/db/schema";

export const STAT_LEAGUES = ["NFL", "NBA", "MLB", "NHL"] as const;
export type StatLeague = (typeof STAT_LEAGUES)[number];

export const SEASON_TYPES = ["regular", "postseason"] as const;
export type SeasonType = (typeof SEASON_TYPES)[number];

export const SEASON_TYPE_LABELS: Record<SeasonType, string> = {
  regular: "Regular season",
  postseason: "Playoffs",
};

/**
 * How a number reads in a cell.
 *   int   1,234        dec1  12.3        dec2  3.45
 *   pct   47.2  (a 0–1 ratio, shown as a percentage; the header says %)
 *   avg3  .288  (batting average, OBP, save percentage — baseball/hockey style)
 *   toi   22:59 (seconds, as minutes:seconds)
 */
export type StatFormat = "int" | "dec1" | "dec2" | "pct" | "avg3" | "toi";

export interface StatColumn {
  key: string;
  /** The header — short, the way box scores write it. */
  label: string;
  /** Spelled out, for the header's tooltip and screen readers. */
  title: string;
  format: StatFormat;
  /** Fewer is better (ERA, GAA, interceptions thrown): sorts ascending first. */
  lowIsGood?: boolean;
}

export interface StatCategory {
  key: string;
  label: string;
  columns: StatColumn[];
  /** The column a table opens sorted by. */
  sort: string;
  /**
   * Who belongs in this table at all: rows with this stat above zero — a
   * quarterback appears under Rushing only if he ran.
   */
  has: string;
  /**
   * "Qualified": at least `share` of the most anyone in the table has of
   * `key` — the leader-board minimum, relative so that it works in week 2 as
   * well as in week 17.
   */
  qualify: { key: string; share: number };
  /** The four numbers at the top of a player's page. */
  headline: [string, string, string, string];
  /** The game log's columns, from the per-game feed. */
  gameColumns: StatColumn[];
}

export interface LeagueConfig {
  league: StatLeague;
  /** The ?sport= key, shared with the board's sport pills (lib/board.ts). */
  key: string;
  label: string;
  sport: Sport;
  /**
   * The month (1–12) a season starts in. A season is named by the year it
   * starts: NBA 2025 is 2025–26, NFL 2025 runs into February 2026.
   */
  startMonth: number;
  /** A season that spans New Year reads "2025–26". */
  spansYears: boolean;
  /** Months games are played in — the regular season and the playoffs. */
  activeMonths: number[];
  /** Months the playoffs are played in. */
  postseasonMonths: number[];
  categories: StatCategory[];
}

/* ---------------------------------------------------------------- columns */

const c = (key: string, label: string, title: string, format: StatFormat = "int", lowIsGood?: boolean): StatColumn => ({
  key,
  label,
  title,
  format,
  ...(lowIsGood ? { lowIsGood } : {}),
});

const GP = c("gp", "GP", "Games played");

/* ------------------------------------------------------------------- NFL */

const nfl: LeagueConfig = {
  league: "NFL",
  key: "nfl",
  label: "NFL",
  sport: "football",
  startMonth: 8,
  spansYears: false,
  activeMonths: [9, 10, 11, 12, 1, 2],
  postseasonMonths: [1, 2],
  categories: [
    {
      key: "passing",
      label: "Passing",
      columns: [
        GP,
        c("pass_cmp", "CMP", "Completions"),
        c("pass_att", "ATT", "Pass attempts"),
        c("pass_pct", "CMP%", "Completion percentage", "pct"),
        c("pass_yds", "YDS", "Passing yards"),
        c("pass_ypa", "Y/A", "Yards per attempt", "dec1"),
        c("pass_td", "TD", "Passing touchdowns"),
        c("pass_int", "INT", "Interceptions thrown", "int", true),
        c("pass_ypg", "YDS/G", "Passing yards per game", "dec1"),
        c("qbr", "QBR", "Total QBR", "dec1"),
      ],
      sort: "pass_yds",
      has: "pass_att",
      qualify: { key: "pass_att", share: 0.4 },
      headline: ["pass_yds", "pass_td", "pass_int", "pass_pct"],
      gameColumns: [
        c("pass_cmp", "CMP", "Completions"),
        c("pass_att", "ATT", "Pass attempts"),
        c("pass_yds", "YDS", "Passing yards"),
        c("pass_td", "TD", "Passing touchdowns"),
        c("pass_int", "INT", "Interceptions thrown"),
        c("rush_yds", "RUSH", "Rushing yards"),
      ],
    },
    {
      key: "rushing",
      label: "Rushing",
      columns: [
        GP,
        c("rush_att", "ATT", "Rushing attempts"),
        c("rush_yds", "YDS", "Rushing yards"),
        c("rush_ypa", "Y/A", "Yards per carry", "dec1"),
        c("rush_td", "TD", "Rushing touchdowns"),
        c("rush_ypg", "YDS/G", "Rushing yards per game", "dec1"),
        c("rush_fum", "FUM", "Rushing fumbles", "int", true),
      ],
      sort: "rush_yds",
      has: "rush_att",
      qualify: { key: "rush_att", share: 0.3 },
      headline: ["rush_yds", "rush_td", "rush_ypa", "rush_att"],
      gameColumns: [
        c("rush_att", "ATT", "Rushing attempts"),
        c("rush_yds", "YDS", "Rushing yards"),
        c("rush_td", "TD", "Rushing touchdowns"),
        c("rec", "REC", "Receptions"),
        c("rec_yds", "REC YDS", "Receiving yards"),
      ],
    },
    {
      key: "receiving",
      label: "Receiving",
      columns: [
        GP,
        c("rec_tgt", "TGT", "Targets"),
        c("rec", "REC", "Receptions"),
        c("rec_yds", "YDS", "Receiving yards"),
        c("rec_ypr", "Y/R", "Yards per reception", "dec1"),
        c("rec_td", "TD", "Receiving touchdowns"),
        c("rec_ypg", "YDS/G", "Receiving yards per game", "dec1"),
      ],
      sort: "rec_yds",
      has: "rec",
      qualify: { key: "rec", share: 0.3 },
      headline: ["rec_yds", "rec", "rec_td", "rec_ypr"],
      gameColumns: [
        c("rec_tgt", "TGT", "Targets"),
        c("rec", "REC", "Receptions"),
        c("rec_yds", "YDS", "Receiving yards"),
        c("rec_td", "TD", "Receiving touchdowns"),
      ],
    },
    {
      key: "defense",
      label: "Defense",
      columns: [
        GP,
        c("tkl", "TKL", "Total tackles"),
        c("solo", "SOLO", "Solo tackles"),
        c("ast_tkl", "AST", "Assisted tackles"),
        c("sacks", "SACK", "Sacks", "dec1"),
        c("ff", "FF", "Forced fumbles"),
        c("fr", "FR", "Fumbles recovered"),
        c("def_int", "INT", "Interceptions"),
        c("int_td", "TD", "Interception touchdowns"),
      ],
      sort: "tkl",
      has: "tkl",
      qualify: { key: "gp", share: 0.5 },
      headline: ["tkl", "sacks", "def_int", "ff"],
      gameColumns: [
        c("tkl", "TKL", "Total tackles"),
        c("solo", "SOLO", "Solo tackles"),
        c("sacks", "SACK", "Sacks", "dec1"),
        c("def_int", "INT", "Interceptions"),
      ],
    },
    {
      key: "kicking",
      label: "Kicking",
      columns: [
        GP,
        c("fgm", "FGM", "Field goals made"),
        c("fga", "FGA", "Field goals attempted"),
        c("fg_pct", "FG%", "Field goal percentage", "pct"),
        c("fg_50", "50+", "Field goals made from 50+ yards"),
        c("pts", "PTS", "Points scored"),
      ],
      sort: "fgm",
      has: "fga",
      qualify: { key: "fga", share: 0.4 },
      headline: ["fgm", "fga", "fg_pct", "fg_50"],
      gameColumns: [c("fgm", "FGM", "Field goals made"), c("fga", "FGA", "Field goals attempted")],
    },
  ],
};

/* ------------------------------------------------------------------- NBA */

const NBA_GAME = [
  c("min", "MIN", "Minutes"),
  c("pts", "PTS", "Points"),
  c("reb", "REB", "Rebounds"),
  c("ast", "AST", "Assists"),
  c("stl", "STL", "Steals"),
  c("blk", "BLK", "Blocks"),
  c("fg3m", "3PM", "Threes made"),
  c("tov", "TOV", "Turnovers"),
];

const nba: LeagueConfig = {
  league: "NBA",
  key: "nba",
  label: "NBA",
  sport: "basketball",
  startMonth: 10,
  spansYears: true,
  activeMonths: [10, 11, 12, 1, 2, 3, 4, 5, 6],
  postseasonMonths: [4, 5, 6],
  categories: [
    {
      key: "pergame",
      label: "Per game",
      columns: [
        GP,
        c("min", "MIN", "Minutes per game", "dec1"),
        c("pts", "PTS", "Points per game", "dec1"),
        c("reb", "REB", "Rebounds per game", "dec1"),
        c("ast", "AST", "Assists per game", "dec1"),
        c("stl", "STL", "Steals per game", "dec1"),
        c("blk", "BLK", "Blocks per game", "dec1"),
        c("tov", "TOV", "Turnovers per game", "dec1", true),
        c("plus_minus", "+/-", "Plus-minus per game", "dec1"),
      ],
      sort: "pts",
      has: "gp",
      qualify: { key: "gp", share: 0.5 },
      headline: ["pts", "reb", "ast", "min"],
      gameColumns: NBA_GAME,
    },
    {
      key: "shooting",
      label: "Shooting",
      columns: [
        GP,
        c("fgm", "FGM", "Field goals made per game", "dec1"),
        c("fga", "FGA", "Field goals attempted per game", "dec1"),
        c("fg_pct", "FG%", "Field goal percentage", "pct"),
        c("fg3m", "3PM", "Threes made per game", "dec1"),
        c("fg3a", "3PA", "Threes attempted per game", "dec1"),
        c("fg3_pct", "3P%", "Three-point percentage", "pct"),
        c("ftm", "FTM", "Free throws made per game", "dec1"),
        c("fta", "FTA", "Free throws attempted per game", "dec1"),
        c("ft_pct", "FT%", "Free throw percentage", "pct"),
      ],
      sort: "fgm",
      has: "fga",
      qualify: { key: "gp", share: 0.5 },
      headline: ["fg_pct", "fg3_pct", "ft_pct", "fg3m"],
      gameColumns: [
        c("min", "MIN", "Minutes"),
        c("pts", "PTS", "Points"),
        c("fgm", "FGM", "Field goals made"),
        c("fga", "FGA", "Field goals attempted"),
        c("fg3m", "3PM", "Threes made"),
        c("fg3a", "3PA", "Threes attempted"),
        c("ftm", "FTM", "Free throws made"),
        c("fta", "FTA", "Free throws attempted"),
      ],
    },
  ],
};

/* ------------------------------------------------------------------- MLB */

const mlb: LeagueConfig = {
  league: "MLB",
  key: "mlb",
  label: "MLB",
  sport: "baseball",
  startMonth: 3,
  spansYears: false,
  activeMonths: [3, 4, 5, 6, 7, 8, 9, 10, 11],
  postseasonMonths: [10, 11],
  categories: [
    {
      key: "batting",
      label: "Batting",
      columns: [
        c("b_gp", "G", "Games"),
        c("ab", "AB", "At bats"),
        c("r", "R", "Runs"),
        c("h", "H", "Hits"),
        c("doubles", "2B", "Doubles"),
        c("triples", "3B", "Triples"),
        c("hr", "HR", "Home runs"),
        c("rbi", "RBI", "Runs batted in"),
        c("bb", "BB", "Walks"),
        c("so", "SO", "Strikeouts", "int", true),
        c("sb", "SB", "Stolen bases"),
        c("avg", "AVG", "Batting average", "avg3"),
        c("obp", "OBP", "On-base percentage", "avg3"),
        c("slg", "SLG", "Slugging percentage", "avg3"),
        c("ops", "OPS", "On-base plus slugging", "avg3"),
      ],
      sort: "avg",
      has: "ab",
      qualify: { key: "ab", share: 0.6 },
      headline: ["avg", "hr", "rbi", "ops"],
      gameColumns: [
        c("ab", "AB", "At bats"),
        c("r", "R", "Runs"),
        c("h", "H", "Hits"),
        c("hr", "HR", "Home runs"),
        c("rbi", "RBI", "Runs batted in"),
        c("bb", "BB", "Walks"),
        c("so", "SO", "Strikeouts"),
        c("sb", "SB", "Stolen bases"),
      ],
    },
    {
      key: "pitching",
      label: "Pitching",
      columns: [
        c("p_gp", "G", "Games"),
        c("gs", "GS", "Games started"),
        c("w", "W", "Wins"),
        c("l", "L", "Losses", "int", true),
        c("era", "ERA", "Earned run average", "dec2", true),
        c("sv", "SV", "Saves"),
        c("ip", "IP", "Innings pitched", "dec1"),
        c("p_h", "H", "Hits allowed", "int", true),
        c("er", "ER", "Earned runs", "int", true),
        c("p_bb", "BB", "Walks", "int", true),
        c("k", "K", "Strikeouts"),
        c("whip", "WHIP", "Walks and hits per inning", "dec2", true),
        c("k9", "K/9", "Strikeouts per nine innings", "dec1"),
      ],
      sort: "era",
      has: "ip",
      qualify: { key: "ip", share: 0.6 },
      headline: ["era", "k", "whip", "w"],
      gameColumns: [
        c("ip", "IP", "Innings pitched", "dec1"),
        c("p_h", "H", "Hits allowed"),
        c("er", "ER", "Earned runs"),
        c("p_bb", "BB", "Walks"),
        c("k", "K", "Strikeouts"),
        c("p_hr", "HR", "Home runs allowed"),
      ],
    },
  ],
};

/* ------------------------------------------------------------------- NHL */

const nhl: LeagueConfig = {
  league: "NHL",
  key: "nhl",
  label: "NHL",
  sport: "hockey",
  startMonth: 10,
  spansYears: true,
  activeMonths: [10, 11, 12, 1, 2, 3, 4, 5, 6],
  postseasonMonths: [4, 5, 6],
  categories: [
    {
      key: "skaters",
      label: "Skaters",
      columns: [
        GP,
        c("g", "G", "Goals"),
        c("a", "A", "Assists"),
        c("pts", "PTS", "Points"),
        c("pm", "+/-", "Plus-minus"),
        c("pim", "PIM", "Penalty minutes", "int", true),
        c("ppg", "PPG", "Power-play goals"),
        c("ppp", "PPP", "Power-play points"),
        c("shg", "SHG", "Short-handed goals"),
        c("gwg", "GWG", "Game-winning goals"),
        c("shots", "SOG", "Shots on goal"),
        c("shot_pct", "S%", "Shooting percentage", "pct"),
        c("toi", "TOI/G", "Time on ice per game", "toi"),
      ],
      sort: "pts",
      has: "skater",
      qualify: { key: "gp", share: 0.5 },
      headline: ["g", "a", "pts", "pm"],
      gameColumns: [
        c("g", "G", "Goals"),
        c("a", "A", "Assists"),
        c("pts", "PTS", "Points"),
        c("pm", "+/-", "Plus-minus"),
        c("shots", "SOG", "Shots on goal"),
        c("hits", "HIT", "Hits"),
        c("toi", "TOI", "Time on ice", "toi"),
      ],
    },
    {
      key: "goalies",
      label: "Goalies",
      columns: [
        GP,
        c("gs", "GS", "Games started"),
        c("w", "W", "Wins"),
        c("l", "L", "Losses", "int", true),
        c("otl", "OTL", "Overtime losses", "int", true),
        c("sa", "SA", "Shots against"),
        c("sv", "SV", "Saves"),
        c("ga", "GA", "Goals against", "int", true),
        c("gaa", "GAA", "Goals-against average", "dec2", true),
        c("sv_pct", "SV%", "Save percentage", "avg3"),
        c("so", "SO", "Shutouts"),
      ],
      sort: "sv_pct",
      has: "goalie",
      qualify: { key: "gp", share: 0.4 },
      headline: ["w", "gaa", "sv_pct", "so"],
      gameColumns: [
        c("sa", "SA", "Shots against"),
        c("sv", "SV", "Saves"),
        c("ga", "GA", "Goals against"),
        c("sv_pct", "SV%", "Save percentage", "avg3"),
        c("toi", "TOI", "Time on ice", "toi"),
      ],
    },
  ],
};

/**
 * The leagues with a Players table and a stats sync — NFL only, like the
 * rest of the site (lib/board.ts). The others stay defined, ready to add
 * back here, and LEAGUE_BY_NAME keeps reading rows already on file.
 */
export const LEAGUES: LeagueConfig[] = [nfl];

export const LEAGUE_BY_NAME: Record<StatLeague, LeagueConfig> = { NFL: nfl, NBA: nba, MLB: mlb, NHL: nhl };

export const DEFAULT_LEAGUE: StatLeague = "NFL";

/* ----------------------------------------------------------------- params */

/** `?sport=` (or a /players/<league> segment) as a league; unknown → the default. */
export function leagueFromParam(value: string | undefined): LeagueConfig {
  return LEAGUES.find((l) => l.key === value?.toLowerCase()) ?? LEAGUE_BY_NAME[DEFAULT_LEAGUE];
}

/** Exact match only, for a URL segment that must name a real league. */
export function leagueFromKey(value: string): LeagueConfig | null {
  return LEAGUES.find((l) => l.key === value) ?? null;
}

export function categoryFromParam(league: LeagueConfig, value: string | undefined): StatCategory {
  return league.categories.find((x) => x.key === value) ?? league.categories[0];
}

export function seasonTypeFromParam(value: string | undefined): SeasonType {
  return value === "postseason" ? "postseason" : "regular";
}

/** A sort key the table actually has; anything else is the table's default. */
export function sortFromParam(category: StatCategory, value: string | undefined): StatColumn {
  return (
    category.columns.find((x) => x.key === value) ??
    category.columns.find((x) => x.key === category.sort) ??
    category.columns[0]
  );
}

/** The direction a column sorts in when first chosen: best first. */
export function defaultDir(column: StatColumn): "asc" | "desc" {
  return column.lowIsGood ? "asc" : "desc";
}

export function dirFromParam(column: StatColumn, value: string | undefined): "asc" | "desc" {
  return value === "asc" || value === "desc" ? value : defaultDir(column);
}

/* ---------------------------------------------------------------- seasons */

/** "2025–26" for a season that spans New Year, "2025" for one that doesn't. */
export function seasonLabel(league: LeagueConfig, season: number): string {
  return league.spansYears ? `${season}–${String((season + 1) % 100).padStart(2, "0")}` : String(season);
}

/** The season under way — or, between seasons, the one that last finished. */
export function currentSeason(league: LeagueConfig, now = new Date()): number {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  return m >= league.startMonth ? y : y - 1;
}

export type SeasonPhase = "before" | "regular" | "postseason" | "over";

/**
 * Where the current season (currentSeason) stands this month. Months are
 * counted from the season's start month, so a season that runs over New Year
 * compares the right way round: August is before the NFL season, March is
 * after it, December is after baseball's.
 */
export function seasonPhase(league: LeagueConfig, now = new Date()): SeasonPhase {
  const idx = (m: number) => (m - league.startMonth + 12) % 12;
  const at = idx(now.getUTCMonth() + 1);
  const active = league.activeMonths.map(idx);
  if (at < Math.min(...active)) return "before";
  if (at > Math.max(...active)) return "over";
  return at >= Math.min(...league.postseasonMonths.map(idx)) ? "postseason" : "regular";
}

/* ------------------------------------------------------------- formatting */

const intFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** A stat as its cell shows it; "—" when the feed had no value. */
export function formatStat(value: number | null | undefined, format: StatFormat): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  switch (format) {
    case "int":
      return intFmt.format(Math.round(value));
    case "dec1":
      return value.toFixed(1);
    case "dec2":
      return value.toFixed(2);
    case "pct":
      return (value * 100).toFixed(1);
    case "avg3": {
      const s = value.toFixed(3);
      return value < 1 ? s.replace(/^0/, "") : s;
    }
    case "toi": {
      const s = Math.round(value);
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    }
  }
}

/** Every column a league's stats rows can carry, by key — for headlines and logs. */
export function columnByKey(league: LeagueConfig, key: string): StatColumn | undefined {
  for (const cat of league.categories) {
    const hit = cat.columns.find((x) => x.key === key) ?? cat.gameColumns.find((x) => x.key === key);
    if (hit) return hit;
  }
  return undefined;
}

/**
 * The table a player is known for: the first of the league's categories
 * their numbers belong in. A quarterback's is Passing although he also runs.
 */
export function primaryCategory(league: LeagueConfig, stats: Record<string, number>): StatCategory {
  return league.categories.find((x) => (stats[x.has] ?? 0) > 0) ?? league.categories[0];
}
