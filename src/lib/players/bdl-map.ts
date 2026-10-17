/**
 * BALLDONTLIE payloads → the catalog's stat keys (lib/players/catalog.ts).
 *
 * Pure: no network, no database. The adapter (balldontlie.ts) fetches and
 * hands the rows here, and scripts can run these against saved fixtures. The
 * field names are the provider's documented ones; anything the feed leaves
 * null or out is left out of `stats`, which the pages show as "—" — never
 * as zero.
 */
import type { SeasonType } from "./catalog";

/** A player's season, ready for player_season_stats. */
export interface SeasonRow {
  providerId: string;
  name: string;
  teamAbbr: string | null;
  position: string | null;
  jersey: string | null;
  gamesPlayed: number | null;
  stats: Record<string, number>;
}

/** One game's line, ready for player_game_stats. */
export interface GameRow {
  gameId: string;
  season: number;
  seasonType: SeasonType;
  playedAt: Date;
  teamAbbr: string | null;
  opponentAbbr: string | null;
  home: boolean | null;
  teamScore: number | null;
  opponentScore: number | null;
  stats: Record<string, number>;
}

/* JSON as it arrives: anything may be missing. */
type Obj = Record<string, unknown>;
type Fields = Record<string, string | [string, (v: unknown) => number | undefined]>;

const obj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);

/** A number, from a number or a numeric string; undefined otherwise. */
export function num(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

/**
 * A rate as a 0–1 ratio. Feeds disagree on whether 47.2% is 0.472 or 47.2;
 * anything above 1 is taken as a percentage.
 */
export function ratio(v: unknown): number | undefined {
  const n = num(v);
  return n === undefined ? undefined : n > 1 ? n / 100 : n;
}

/** Minutes as a number, from 35.8, "35.8" or "35:48". */
export function minutes(v: unknown): number | undefined {
  if (typeof v === "string" && v.includes(":")) {
    const [m, s] = v.split(":").map(Number);
    return Number.isFinite(m) && Number.isFinite(s) ? m + s / 60 : undefined;
  }
  return num(v);
}

/**
 * Time on ice in seconds, from "22:59", 1379 (seconds) or 22.98 (minutes).
 * Nobody plays 200 minutes a game, so a number above that is seconds.
 */
export function toiSeconds(v: unknown): number | undefined {
  if (typeof v === "string" && v.includes(":")) {
    const [m, s] = v.split(":").map(Number);
    return Number.isFinite(m) && Number.isFinite(s) ? m * 60 + s : undefined;
  }
  const n = num(v);
  return n === undefined ? undefined : n > 200 ? n : n * 60;
}

/** Copies the fields that have a value, under our keys. */
function pick(src: Obj, fields: Fields): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, spec] of Object.entries(fields)) {
    const [field, read] = typeof spec === "string" ? [spec, num] : spec;
    const v = read(src[field]);
    if (v !== undefined) out[key] = v;
  }
  return out;
}

function fullName(p: Obj): string {
  return str(p.full_name) ?? [str(p.first_name), str(p.last_name)].filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------- NBA */

const NBA_SEASON_FIELDS: Fields = {
  gp: "gp",
  min: ["min", minutes],
  pts: "pts",
  reb: "reb",
  oreb: "oreb",
  dreb: "dreb",
  ast: "ast",
  stl: "stl",
  blk: "blk",
  tov: "tov",
  pf: "pf",
  plus_minus: "plus_minus",
  fgm: "fgm",
  fga: "fga",
  fg_pct: ["fg_pct", ratio],
  fg3m: "fg3m",
  fg3a: "fg3a",
  fg3_pct: ["fg3_pct", ratio],
  ftm: "ftm",
  fta: "fta",
  ft_pct: ["ft_pct", ratio],
};

/** /v1/season_averages/general?type=base — one player's per-game averages. */
export function nbaSeasonRow(row: unknown): SeasonRow | null {
  const r = obj(row);
  const p = obj(r.player);
  const s = obj(r.stats);
  if (p.id === undefined) return null;
  const stats = pick(s, NBA_SEASON_FIELDS);
  // Some feeds say "turnover" where others say "tov".
  if (stats.tov === undefined && num(s.turnover) !== undefined) stats.tov = num(s.turnover)!;
  return {
    providerId: String(p.id),
    name: fullName(p),
    teamAbbr: str(s.team_abbreviation) ?? str(obj(p.team).abbreviation),
    position: str(p.position),
    jersey: str(p.jersey_number),
    gamesPlayed: num(s.gp) ?? null,
    stats,
  };
}

/** /v1/stats — one game's box score line, with the teams looked up by id. */
export function nbaGameRow(row: unknown, teamAbbrById: Map<number, string>): GameRow | null {
  const r = obj(row);
  const g = obj(r.game);
  const team = obj(r.team);
  if (g.id === undefined || !str(g.date)) return null;
  const teamId = num(team.id);
  const home = teamId !== undefined ? teamId === num(g.home_team_id) : null;
  const oppId = home === null ? undefined : num(home ? g.visitor_team_id : g.home_team_id);
  const stats = pick(r, {
    min: ["min", minutes],
    pts: "pts",
    reb: "reb",
    ast: "ast",
    stl: "stl",
    blk: "blk",
    tov: "turnover",
    fgm: "fgm",
    fga: "fga",
    fg3m: "fg3m",
    fg3a: "fg3a",
    ftm: "ftm",
    fta: "fta",
    plus_minus: "plus_minus",
  });
  return {
    gameId: String(g.id),
    season: num(g.season) ?? 0,
    seasonType: g.postseason === true ? "postseason" : "regular",
    playedAt: new Date(str(g.date)!),
    teamAbbr: str(team.abbreviation),
    opponentAbbr: oppId !== undefined ? (teamAbbrById.get(oppId) ?? null) : null,
    home,
    teamScore: home === null ? null : (num(home ? g.home_team_score : g.visitor_team_score) ?? null),
    opponentScore: home === null ? null : (num(home ? g.visitor_team_score : g.home_team_score) ?? null),
    stats,
  };
}

/* ------------------------------------------------------------------- NFL */

/** /nfl/v1/season_stats — a season's totals. The team comes from the caller. */
export function nflSeasonRow(row: unknown, teamAbbr: string | null): SeasonRow | null {
  const r = obj(row);
  const p = obj(r.player);
  if (p.id === undefined) return null;
  const stats = pick(r, {
    gp: "games_played",
    pass_cmp: "passing_completions",
    pass_att: "passing_attempts",
    pass_yds: "passing_yards",
    pass_ypa: "yards_per_pass_attempt",
    pass_td: "passing_touchdowns",
    pass_int: "passing_interceptions",
    pass_ypg: "passing_yards_per_game",
    pass_pct: ["passing_completion_pct", ratio],
    qbr: "qbr",
    rush_att: "rushing_attempts",
    rush_yds: "rushing_yards",
    rush_ypg: "rushing_yards_per_game",
    rush_ypa: "yards_per_rush_attempt",
    rush_td: "rushing_touchdowns",
    rush_fum: "rushing_fumbles",
    rec: "receptions",
    rec_yds: "receiving_yards",
    rec_ypr: "yards_per_reception",
    rec_td: "receiving_touchdowns",
    rec_tgt: "receiving_targets",
    rec_ypg: "receiving_yards_per_game",
    tkl: "total_tackles",
    solo: "solo_tackles",
    ast_tkl: "assist_tackles",
    sacks: "defensive_sacks",
    ff: "fumbles_forced",
    fr: "fumbles_recovered",
    def_int: "defensive_interceptions",
    int_td: "interception_touchdowns",
    fgm: "field_goals_made",
    fga: "field_goal_attempts",
    fg_pct: ["field_goal_pct", ratio],
    fg_50: "field_goals_made_50",
    pts: "total_points",
  });
  return {
    providerId: String(p.id),
    name: fullName(p),
    teamAbbr,
    position: str(p.position_abbreviation) ?? str(p.position),
    jersey: str(p.jersey_number),
    gamesPlayed: num(r.games_played) ?? null,
    stats,
  };
}

/** /nfl/v1/stats — one game; the game object carries both teams. */
export function nflGameRow(row: unknown): GameRow | null {
  const r = obj(row);
  const g = obj(r.game);
  const team = obj(r.team);
  const homeTeam = obj(g.home_team);
  const awayTeam = obj(g.visitor_team);
  if (g.id === undefined || !str(g.date)) return null;
  const teamId = num(team.id);
  const home = teamId !== undefined ? teamId === num(homeTeam.id) : null;
  return {
    gameId: String(g.id),
    season: num(g.season) ?? 0,
    seasonType: g.postseason === true ? "postseason" : "regular",
    playedAt: new Date(str(g.date)!),
    teamAbbr: str(team.abbreviation),
    opponentAbbr: home === null ? null : str(home ? awayTeam.abbreviation : homeTeam.abbreviation),
    home,
    teamScore: home === null ? null : (num(home ? g.home_team_score : g.visitor_team_score) ?? null),
    opponentScore: home === null ? null : (num(home ? g.visitor_team_score : g.home_team_score) ?? null),
    stats: pick(r, {
      pass_cmp: "passing_completions",
      pass_att: "passing_attempts",
      pass_yds: "passing_yards",
      pass_td: "passing_touchdowns",
      pass_int: "passing_interceptions",
      rush_att: "rushing_attempts",
      rush_yds: "rushing_yards",
      rush_td: "rushing_touchdowns",
      rec: "receptions",
      rec_yds: "receiving_yards",
      rec_td: "receiving_touchdowns",
      rec_tgt: "receiving_targets",
      tkl: "total_tackles",
      solo: "solo_tackles",
      sacks: "defensive_sacks",
      def_int: "defensive_interceptions",
      fgm: "field_goals_made",
      fga: "field_goal_attempts",
      xpm: "extra_points_made",
    }),
  };
}

/* ------------------------------------------------------------------- MLB */

/** The feed spells MLB positions out; tables want the scorecard letters. */
const MLB_POSITIONS: Record<string, string> = {
  pitcher: "P",
  "starting pitcher": "SP",
  "relief pitcher": "RP",
  catcher: "C",
  "first baseman": "1B",
  "second baseman": "2B",
  "third baseman": "3B",
  shortstop: "SS",
  "left fielder": "LF",
  "center fielder": "CF",
  "right fielder": "RF",
  outfielder: "OF",
  infielder: "IF",
  "designated hitter": "DH",
};

export function mlbPosition(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  return MLB_POSITIONS[s.toLowerCase()] ?? (s.length <= 3 ? s.toUpperCase() : s);
}

/**
 * /mlb/v1/season_stats — batting and pitching on one row. The row names the
 * season's team only by name ("Yankees"), so the caller passes a lookup from
 * the teams list; the player's current team is the fallback.
 */
export function mlbSeasonRow(row: unknown, teamAbbrByName: Map<string, string>): SeasonRow | null {
  const r = obj(row);
  const p = obj(r.player);
  if (p.id === undefined) return null;
  const stats = pick(r, {
    b_gp: "batting_gp",
    ab: "batting_ab",
    r: "batting_r",
    h: "batting_h",
    avg: "batting_avg",
    doubles: "batting_2b",
    triples: "batting_3b",
    hr: "batting_hr",
    rbi: "batting_rbi",
    tb: "batting_tb",
    bb: "batting_bb",
    so: "batting_so",
    sb: "batting_sb",
    obp: "batting_obp",
    slg: "batting_slg",
    ops: "batting_ops",
    war: "batting_war",
    p_gp: "pitching_gp",
    gs: "pitching_gs",
    qs: "pitching_qs",
    w: "pitching_w",
    l: "pitching_l",
    era: "pitching_era",
    sv: "pitching_sv",
    hld: "pitching_hld",
    ip: "pitching_ip",
    p_h: "pitching_h",
    er: "pitching_er",
    p_hr: "pitching_hr",
    p_bb: "pitching_bb",
    whip: "pitching_whip",
    k: "pitching_k",
    k9: "pitching_k_per_9",
    p_war: "pitching_war",
  });
  const teamName = str(r.team_name);
  const gp = Math.max(stats.b_gp ?? 0, stats.p_gp ?? 0);
  return {
    providerId: String(p.id),
    name: fullName(p),
    teamAbbr: (teamName ? teamAbbrByName.get(teamName.toLowerCase()) : undefined) ?? str(obj(p.team).abbreviation),
    position: mlbPosition(p.position),
    jersey: str(p.jersey),
    gamesPlayed: gp > 0 ? gp : null,
    stats,
  };
}

/** A game as /mlb/v1/games describes it — what a box score line refers to by id. */
export interface MlbGame {
  id: number;
  season: number;
  postseason: boolean;
  date: string;
  homeId: number | undefined;
  homeAbbr: string | null;
  awayAbbr: string | null;
  homeRuns: number | undefined;
  awayRuns: number | undefined;
}

export function mlbGame(row: unknown): MlbGame | null {
  const g = obj(row);
  const id = num(g.id);
  if (id === undefined || !str(g.date)) return null;
  return {
    id,
    season: num(g.season) ?? 0,
    postseason: g.postseason === true || g.season_type === "postseason",
    date: str(g.date)!,
    homeId: num(obj(g.home_team).id),
    homeAbbr: str(obj(g.home_team).abbreviation),
    awayAbbr: str(obj(g.away_team).abbreviation),
    homeRuns: num(obj(g.home_team_data).runs),
    awayRuns: num(obj(g.away_team_data).runs),
  };
}

/** /mlb/v1/stats — a line that names its game by id only. */
export function mlbGameRow(row: unknown, games: Map<number, MlbGame>): GameRow | null {
  const r = obj(row);
  const game = games.get(num(r.game_id) ?? -1);
  if (!game) return null;
  const team = obj(r.team);
  const teamId = num(team.id);
  const home = teamId !== undefined && game.homeId !== undefined ? teamId === game.homeId : null;
  return {
    gameId: String(game.id),
    season: game.season,
    seasonType: game.postseason ? "postseason" : "regular",
    playedAt: new Date(game.date),
    teamAbbr: str(team.abbreviation),
    opponentAbbr: home === null ? null : home ? game.awayAbbr : game.homeAbbr,
    home,
    teamScore: home === null ? null : ((home ? game.homeRuns : game.awayRuns) ?? null),
    opponentScore: home === null ? null : ((home ? game.awayRuns : game.homeRuns) ?? null),
    stats: pick(r, {
      ab: "at_bats",
      r: "runs",
      h: "hits",
      hr: "hr",
      rbi: "rbi",
      bb: "bb",
      so: "k",
      sb: "stolen_bases",
      ip: "ip",
      p_h: "p_hits",
      er: "er",
      p_bb: "p_bb",
      k: "p_k",
      p_hr: "p_hr",
    }),
  };
}

/* ------------------------------------------------------------------- NHL */

/** /nhl/v1/players/:id/season_stats gives name/value pairs; these are ours. */
const NHL_SEASON_NAMES: Record<string, [string, (v: unknown) => number | undefined]> = {
  games_played: ["gp", num],
  goals: ["g", num],
  assists: ["a", num],
  points: ["pts", num],
  plus_minus: ["pm", num],
  penalty_minutes: ["pim", num],
  power_play_goals: ["ppg", num],
  power_play_points: ["ppp", num],
  short_handed_goals: ["shg", num],
  game_winning_goals: ["gwg", num],
  shots: ["shots", num],
  shooting_pct: ["shot_pct", ratio],
  faceoff_win_pct: ["fo_pct", ratio],
  time_on_ice_per_game: ["toi", toiSeconds],
  games_started: ["gs", num],
  wins: ["w", num],
  losses: ["l", num],
  ot_losses: ["otl", num],
  shots_against: ["sa", num],
  saves: ["sv", num],
  goals_against: ["ga", num],
  goals_against_average: ["gaa", num],
  save_pct: ["sv_pct", ratio],
  shutouts: ["so", num],
};

/** The provider's names for hockey season stats — scripts/verify.mjs feeds them all in. */
export const NHL_STAT_NAMES = Object.keys(NHL_SEASON_NAMES);

/** A player from /nhl/v1/players?seasons[]=…, with that season's team. */
export interface NhlPlayer {
  id: string;
  name: string;
  position: string | null;
  teamAbbr: string | null;
}

export function nhlPlayer(row: unknown, season: number): NhlPlayer | null {
  const p = obj(row);
  if (p.id === undefined) return null;
  const teams = Array.isArray(p.teams) ? p.teams.map(obj) : [];
  // The last team listed for the season: where a traded player ended up.
  const team = teams.filter((t) => num(t.season) === season).at(-1) ?? teams.at(-1);
  return {
    id: String(p.id),
    name: fullName(p),
    position: str(p.position_code),
    teamAbbr: team ? str(team.tricode) : null,
  };
}

export function nhlSeasonRow(player: NhlPlayer, pairs: unknown): SeasonRow | null {
  const stats: Record<string, number> = {};
  for (const pair of Array.isArray(pairs) ? pairs.map(obj) : []) {
    const name = str(pair.name);
    const spec = name ? NHL_SEASON_NAMES[name] : undefined;
    if (!spec) continue;
    const v = spec[1](pair.value);
    if (v !== undefined) stats[spec[0]] = v;
  }
  if (!stats.gp) return null;
  // Which of the two tables the player belongs in (catalog `has`).
  if (player.position === "G") stats.goalie = 1;
  else stats.skater = 1;
  return {
    providerId: player.id,
    name: player.name,
    teamAbbr: player.teamAbbr,
    position: player.position,
    jersey: null,
    gamesPlayed: stats.gp,
    stats,
  };
}

/** /nhl/v1/box_scores — one game; the game object carries both teams. */
export function nhlGameRow(row: unknown): GameRow | null {
  const r = obj(row);
  const g = obj(r.game);
  const team = obj(r.team);
  const homeTeam = obj(g.home_team);
  const awayTeam = obj(g.away_team);
  const when = str(g.start_time_utc) ?? str(g.game_date);
  if (g.id === undefined || !when) return null;
  const teamId = num(team.id);
  const home = teamId !== undefined ? teamId === num(homeTeam.id) : null;
  const stats = pick(r, {
    g: "goals",
    a: "assists",
    pts: "points",
    pm: "plus_minus",
    pim: "penalty_minutes",
    shots: "shots_on_goal",
    hits: "hits",
    toi: ["time_on_ice", toiSeconds],
    sa: "shots_against",
    sv: "saves",
    ga: "goals_against",
    sv_pct: ["save_pct", ratio],
  });
  // A goalie's box score has saves and shots but may not say the percentage.
  if (stats.sv_pct === undefined && stats.sv !== undefined && stats.sa) stats.sv_pct = stats.sv / stats.sa;
  return {
    gameId: String(g.id),
    season: num(g.season) ?? 0,
    seasonType: g.postseason === true ? "postseason" : "regular",
    playedAt: new Date(when),
    teamAbbr: str(team.tricode),
    opponentAbbr: home === null ? null : str(home ? awayTeam.tricode : homeTeam.tricode),
    home,
    teamScore: home === null ? null : (num(home ? g.home_score : g.away_score) ?? null),
    opponentScore: home === null ? null : (num(home ? g.away_score : g.home_score) ?? null),
    stats,
  };
}
