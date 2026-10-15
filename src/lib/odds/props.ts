/**
 * The maths of grading a player prop from a box score — no database, no
 * network, so scripts/verify.mjs checks it directly. settle-props.ts does the
 * looking-up around it.
 */
import type { PickStatus } from "@/db/schema";
import { PROP_LABELS } from "./markets";

/** The box-score stat each over/under prop is graded on. */
const STAT: Record<string, string> = {
  player_pass_yds: "pass_yds",
  player_pass_tds: "pass_td",
  player_rush_yds: "rush_yds",
  player_receptions: "rec",
  player_reception_yds: "rec_yds",
};

/** The odds feed names teams in full, the stats feed by abbreviation. */
export const NFL_TEAM_ABBR: Record<string, string> = {
  "Arizona Cardinals": "ARI",
  "Atlanta Falcons": "ATL",
  "Baltimore Ravens": "BAL",
  "Buffalo Bills": "BUF",
  "Carolina Panthers": "CAR",
  "Chicago Bears": "CHI",
  "Cincinnati Bengals": "CIN",
  "Cleveland Browns": "CLE",
  "Dallas Cowboys": "DAL",
  "Denver Broncos": "DEN",
  "Detroit Lions": "DET",
  "Green Bay Packers": "GB",
  "Houston Texans": "HOU",
  "Indianapolis Colts": "IND",
  "Jacksonville Jaguars": "JAX",
  "Kansas City Chiefs": "KC",
  "Las Vegas Raiders": "LV",
  "Los Angeles Chargers": "LAC",
  "Los Angeles Rams": "LAR",
  "Miami Dolphins": "MIA",
  "Minnesota Vikings": "MIN",
  "New England Patriots": "NE",
  "New Orleans Saints": "NO",
  "New York Giants": "NYG",
  "New York Jets": "NYJ",
  "Philadelphia Eagles": "PHI",
  "Pittsburgh Steelers": "PIT",
  "San Francisco 49ers": "SF",
  "Seattle Seahawks": "SEA",
  "Tampa Bay Buccaneers": "TB",
  "Tennessee Titans": "TEN",
  "Washington Commanders": "WSH",
};

/** "A.J. Brown", "AJ Brown" and "Marvin Harrison Jr." all reduce to one key. */
export function playerKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.'’]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** A box score's verdict on one prop, or null if it doesn't decide it. */
export function gradeProp(
  sel: { marketKey: string; outcome: string; point: number | null },
  stats: Record<string, number>,
): { status: Exclude<PickStatus, "pending">; value: number } | null {
  const fromMargin = (m: number): "won" | "lost" | "push" => (m > 0 ? "won" : m < 0 ? "lost" : "push");
  if (sel.marketKey === "player_anytime_td") {
    const tds = (stats.rush_td ?? 0) + (stats.rec_td ?? 0);
    if (sel.outcome === "Yes") return { status: tds > 0 ? "won" : "lost", value: tds };
    if (sel.outcome === "No") return { status: tds > 0 ? "lost" : "won", value: tds };
    return null;
  }
  const key = STAT[sel.marketKey];
  if (!key || sel.point === null) return null;
  // A player with a box-score row who never caught a pass has no `rec` in it.
  const value = stats[key] ?? 0;
  if (sel.outcome === "Over") return { status: fromMargin(value - sel.point), value };
  if (sel.outcome === "Under") return { status: fromMargin(sel.point - value), value };
  return null;
}

/** "Travis Kelce 7 Receptions", "Travis Kelce 1 TD" — the card's "Final …". */
export function propResultLabel(player: string, marketKey: string, value: number): string {
  if (marketKey === "player_anytime_td") return `${player} ${value} TD${value === 1 ? "" : "s"}`;
  return `${player} ${value} ${PROP_LABELS[marketKey] ?? marketKey}`;
}
