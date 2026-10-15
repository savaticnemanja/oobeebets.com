/**
 * What the odds feed covers and how its bets read on a card. Nothing here
 * touches the database or the network, so the pickers in the browser and the
 * actions on the server share one copy — the same arrangement as
 * lib/follows.ts and lib/social-rules.ts.
 */
import type { Market, PickCategory, PickStatus, Sport } from "@/db/schema";

/** NFL only, like the rest of the site (SPORT_FILTERS in lib/board.ts). */
export const FEED_LEAGUES = ["NFL"] as const;
export type FeedLeague = (typeof FEED_LEAGUES)[number];

export const LEAGUE_CONFIG: Record<
  FeedLeague,
  { sportKey: string; sport: Sport; propMarkets: readonly string[] }
> = {
  NFL: {
    sportKey: "americanfootball_nfl",
    sport: "football",
    propMarkets: [
      "player_pass_yds",
      "player_pass_tds",
      "player_rush_yds",
      "player_receptions",
      "player_reception_yds",
      "player_anytime_td",
    ],
  },
};

/**
 * Every league the feed has ever carried, for grading only. A league taken
 * off the menu (MLB, when the site went NFL only) still has legs on file
 * waiting for a result, and the results poller keeps fetching its scores
 * until they're all graded.
 */
export const SCORES_SPORT_KEYS: Record<string, string> = {
  NFL: "americanfootball_nfl",
  MLB: "baseball_mlb",
};

export const GAME_MARKETS = ["h2h", "spreads", "totals"] as const;
export type GameMarketKey = (typeof GAME_MARKETS)[number];

export function isGameMarket(key: string): key is GameMarketKey {
  return (GAME_MARKETS as readonly string[]).includes(key);
}

/**
 * What each provider market is called on a card, after the player's name.
 * The MLB ones stay: lines already on file still need their names.
 */
export const PROP_LABELS: Record<string, string> = {
  player_pass_yds: "Passing Yards",
  player_pass_tds: "Passing TDs",
  player_rush_yds: "Rushing Yards",
  player_receptions: "Receptions",
  player_reception_yds: "Receiving Yards",
  player_anytime_td: "Anytime TD",
  pitcher_strikeouts: "Strikeouts",
  pitcher_hits_allowed: "Hits Allowed",
  batter_hits: "Hits",
  batter_home_runs: "Home Runs",
  batter_rbis: "RBIs",
};

export const GAME_MARKET_LABELS: Record<GameMarketKey, string> = {
  h2h: "Moneyline",
  spreads: "Spread",
  totals: "Total",
};

export function marketLabel(key: string): string {
  return isGameMarket(key) ? GAME_MARKET_LABELS[key] : (PROP_LABELS[key] ?? key);
}

/** The board a line belongs on. */
export function marketCategory(key: string): PickCategory {
  return isGameMarket(key) ? "game" : "prop";
}

/** The picks.market enum value a line is stored under. */
export function marketEnum(key: string): Market {
  if (key === "h2h") return "moneyline";
  if (key === "spreads") return "spread";
  if (key === "totals") return "total";
  return "prop";
}

export interface LineFacts {
  marketKey: string;
  outcome: string;
  player: string | null;
  /** numeric arrives from Postgres as a string. */
  point: string | number | null;
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

/**
 * The selection as it reads on a card — the same sentence everywhere, so a
 * pick and a community leg on the same line are visibly the same bet:
 *
 *   Kansas City Chiefs ML · Kansas City Chiefs -3.5 · Over 47.5
 *   Aaron Judge Over 0.5 Hits · Travis Kelce Anytime TD
 */
export function lineLabel(l: LineFacts): string {
  const point = l.point === null ? null : Number(l.point);
  if (l.marketKey === "h2h") return `${l.outcome} ML`;
  if (l.marketKey === "spreads") return `${l.outcome} ${point === null ? "" : signed(point)}`.trim();
  if (l.marketKey === "totals") return `${l.outcome} ${point ?? ""}`.trim();
  if (l.marketKey === "player_anytime_td") {
    return l.outcome === "No" ? `${l.player} No TD` : `${l.player} Anytime TD`;
  }
  return [l.player, l.outcome, point, PROP_LABELS[l.marketKey] ?? l.marketKey]
    .filter((x) => x !== null && x !== "")
    .join(" ");
}

/** "Dallas Cowboys vs Kansas City Chiefs" — away first, as the board has always read. */
export function eventLabel(g: { awayTeam: string; homeTeam: string }): string {
  return `${g.awayTeam} vs ${g.homeTeam}`;
}

/** American odds as a payout multiplier, for comparing prices across books. */
export { americanToDecimal as decimalOdds } from "@/lib/settlement";

/* ---------------------------------------------------------------- grading */

export interface GameResult {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
}

/**
 * Grades a game-market bet from the final score. Null for player props,
 * which the feed cannot grade — it has no player stats — and which an admin
 * settles on /admin/settle instead.
 *
 * A tied moneyline is a push: that is how US books grade a two-way moneyline
 * when the game ends level (an NFL tie), and MLB games cannot tie.
 */
export function gradeLine(l: LineFacts, g: GameResult): PickStatus | null {
  const point = l.point === null ? null : Number(l.point);
  const mine =
    l.outcome === g.homeTeam ? g.homeScore : l.outcome === g.awayTeam ? g.awayScore : null;
  const theirs =
    l.outcome === g.homeTeam ? g.awayScore : l.outcome === g.awayTeam ? g.homeScore : null;

  const fromMargin = (m: number): PickStatus => (m > 0 ? "won" : m < 0 ? "lost" : "push");

  switch (l.marketKey) {
    case "h2h":
      if (mine === null || theirs === null) return null;
      return fromMargin(mine - theirs);
    case "spreads":
      if (mine === null || theirs === null || point === null) return null;
      return fromMargin(mine + point - theirs);
    case "totals": {
      if (point === null) return null;
      const total = g.homeScore + g.awayScore;
      if (l.outcome === "Over") return fromMargin(total - point);
      if (l.outcome === "Under") return fromMargin(point - total);
      return null;
    }
    default:
      return null;
  }
}

/** "Dallas Cowboys 20, Kansas City Chiefs 27" — what a settled card prints. */
export function finalScoreLabel(g: GameResult): string {
  return `${g.awayTeam} ${g.awayScore}, ${g.homeTeam} ${g.homeScore}`;
}

/** The legs a community parlay may have — the same bounds as lib/parlays.ts. */
export { MIN_PARLAY_LEGS, MAX_PARLAY_LEGS } from "@/lib/parlays";

/* ------------------------------------------------------- picker shapes */

/** One pickable price: the best price on the consensus line, and where it is. */
export interface LineOption {
  lineId: string;
  marketKey: string;
  outcome: string;
  player: string | null;
  point: number | null;
  price: number;
  bookTitle: string;
  label: string;
}

export interface GameOption {
  id: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: Date;
  /** Away row then home row, as a sportsbook lays a game out. */
  spread: { away: LineOption | null; home: LineOption | null };
  moneyline: { away: LineOption | null; home: LineOption | null };
  total: { over: LineOption | null; under: LineOption | null };
}

export interface PropRow {
  player: string;
  over: LineOption | null;
  under: LineOption | null;
  /** Yes/no props (anytime TD) have one side worth offering. */
  yes: LineOption | null;
}

export interface PropGroup {
  marketKey: string;
  label: string;
  rows: PropRow[];
}
