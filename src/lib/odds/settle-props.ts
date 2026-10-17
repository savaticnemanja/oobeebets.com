import "server-only";
import { and, eq, inArray, lt } from "drizzle-orm";
import { db } from "@/db";
import { games, playerGameStats, selections, statPlayers } from "@/db/schema";
import { statsConfigured } from "@/lib/players/balldontlie";
import { LEAGUE_BY_NAME, currentSeason } from "@/lib/players/catalog";
import { ensureGameLog } from "@/lib/players/sync";
import { claim } from "@/lib/sync-claim";
import { LEAGUE_CONFIG } from "./markets";
import { NFL_TEAM_ABBR, gradeProp, playerKey, propResultLabel } from "./props";
import { settleSelection } from "./settle";

/**
 * Grading NFL player props from the stats feed's box scores, the way
 * autoSettle grades game bets from the final score. Pick props and the props
 * testers put in community parlays are both selections, so this covers both.
 *
 * It only settles what it can be sure of, and leaves the rest on
 * /admin/settle:
 *   - the player has to resolve to exactly one stats-feed player, by name,
 *     who played for one of the two teams in that game — the NFL has two
 *     Josh Allens;
 *   - they need a box-score row for the game. No row means they didn't play
 *     (books void that) or the feed hasn't caught up; both are an admin's call.
 *
 * Anytime TD counts rushing and receiving touchdowns. The feed has no return
 * touchdowns, so a returner who only scores on a return grades as a loss —
 * rare enough to correct by hand on /admin/settle when it happens.
 */

const NFL_PROPS = LEAGUE_CONFIG.NFL.propMarkets;

/**
 * Grades every pending NFL prop on a finished game. Claimed for ten minutes
 * at a time, because a page render can start it as well as the poller, and
 * each player it has to look up costs a stats-feed request.
 */
export async function autoSettleProps(): Promise<number> {
  if (!statsConfigured()) return 0;
  if (!(await claim("grade:props:NFL", 10))) return 0;

  const due = await db
    .select({
      id: selections.id,
      marketKey: selections.marketKey,
      outcome: selections.outcome,
      player: selections.player,
      point: selections.point,
      homeTeam: games.homeTeam,
      awayTeam: games.awayTeam,
      commenceTime: games.commenceTime,
    })
    .from(selections)
    .innerJoin(games, eq(games.id, selections.gameId))
    .where(
      and(
        eq(selections.status, "pending"),
        eq(selections.manualHold, false),
        eq(games.league, "NFL"),
        eq(games.completed, true),
        inArray(selections.marketKey, [...NFL_PROPS]),
        // Box scores land a little after the final whistle; don't spend
        // requests asking before they can be there.
        lt(games.commenceTime, new Date(Date.now() - 4 * 60 * 60 * 1000)),
      ),
    );
  if (due.length === 0) return 0;

  const roster = await db
    .select({ id: statPlayers.id, name: statPlayers.name })
    .from(statPlayers)
    .where(eq(statPlayers.league, "NFL"));
  const byName = new Map<string, string[]>();
  for (const p of roster) {
    const k = playerKey(p.name);
    byName.set(k, [...(byName.get(k) ?? []), p.id]);
  }

  let settled = 0;
  for (const d of due) {
    if (!d.player) continue;
    const teams = [NFL_TEAM_ABBR[d.homeTeam], NFL_TEAM_ABBR[d.awayTeam]];
    if (!teams[0] || !teams[1]) continue;
    const season = currentSeason(LEAGUE_BY_NAME.NFL, d.commenceTime);
    // The game's box score is the one dated within a day of kick-off.
    const from = new Date(d.commenceTime.getTime() - 24 * 60 * 60 * 1000);
    const to = new Date(d.commenceTime.getTime() + 24 * 60 * 60 * 1000);

    const rows = [];
    for (const playerId of byName.get(playerKey(d.player)) ?? []) {
      // Thirty minutes, not the player page's six hours: a log fetched before
      // kick-off would otherwise hide the game for the rest of the day.
      await ensureGameLog(playerId, season, 30);
      const found = await db
        .select({ stats: playerGameStats.stats, playedAt: playerGameStats.playedAt, team: playerGameStats.teamAbbr })
        .from(playerGameStats)
        .where(and(eq(playerGameStats.playerId, playerId), eq(playerGameStats.season, season)));
      rows.push(
        ...found.filter((r) => r.team && teams.includes(r.team) && r.playedAt >= from && r.playedAt <= to),
      );
    }
    if (rows.length !== 1) continue;

    const point = d.point === null ? null : Number(d.point);
    const graded = gradeProp({ marketKey: d.marketKey, outcome: d.outcome, point }, rows[0].stats);
    if (!graded) continue;
    await settleSelection(d.id, { status: graded.status, finalScore: propResultLabel(d.player, d.marketKey, graded.value) }, null);
    settled++;
  }
  return settled;
}
