import "server-only";
import { and, asc, eq, gt, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { games, lines, parlaySelectionLegs, picks, selections } from "@/db/schema";
import type { Game, Line } from "@/db/schema";
import { slateDateString } from "@/lib/slate-date";
import { slateBounds } from "./sync";
import {
  FEED_LEAGUES,
  GAME_MARKETS,
  LEAGUE_CONFIG,
  PROP_LABELS,
  baseMarket,
  decimalOdds,
  eventLabel,
  lineLabel,
  type FeedLeague,
  type GameOption,
  type LineOption,
  type PropGroup,
  type PropRow,
  type PropRung,
} from "./markets";

/**
 * What the pickers show, built from the raw feed.
 *
 * Four books quote every market, often at slightly different numbers (one has
 * the Chiefs -3, another -3.5). Showing all of them would turn a game into a
 * spreadsheet, so each market collapses to its *consensus* line — the number
 * most books are hanging — and each side of it to the best price on offer at
 * that number, labelled with the book. That is the bet a careful bettor would
 * actually place, and it is the one the selection freezes.
 */

function toOption(l: Line): LineOption {
  return {
    lineId: l.id,
    marketKey: l.marketKey,
    outcome: l.outcome,
    player: l.player,
    point: l.point === null ? null : Number(l.point),
    price: l.price,
    bookTitle: l.bookTitle,
    label: lineLabel(l),
  };
}

function best(candidates: Line[]): Line | null {
  let top: Line | null = null;
  for (const c of candidates) {
    if (!top || decimalOdds(c.price) > decimalOdds(top.price)) top = c;
  }
  return top;
}

/**
 * The consensus |point| across one market (for one player, on props): the
 * value the most book-quotes sit at, ties broken toward the smaller number.
 * Absolute, because a spread's two sides carry opposite signs of one number.
 */
function consensusPoint(group: Line[]): number | null {
  const counts = new Map<number, number>();
  for (const l of group) {
    if (l.point === null) continue;
    const k = Math.abs(Number(l.point));
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let pick: number | null = null;
  for (const [k, n] of counts) {
    if (pick === null || n > counts.get(pick)! || (n === counts.get(pick)! && k < pick)) pick = k;
  }
  return pick;
}

/** The best line for `outcome` in `group`, on the consensus number. */
export function sideAt(group: Line[], outcome: string): LineOption | null {
  const point = consensusPoint(group);
  const side = group.filter(
    (l) =>
      l.outcome === outcome &&
      (point === null ? l.point === null : l.point !== null && Math.abs(Number(l.point)) === point),
  );
  const b = best(side);
  return b ? toOption(b) : null;
}

function gameOption(g: Game, ls: Line[]): GameOption {
  const market = (k: string) => ls.filter((l) => l.marketKey === k);
  const spreads = market("spreads");
  const h2h = market("h2h");
  const totals = market("totals");
  return {
    id: g.id,
    league: g.league,
    homeTeam: g.homeTeam,
    awayTeam: g.awayTeam,
    commenceTime: g.commenceTime,
    spread: { away: sideAt(spreads, g.awayTeam), home: sideAt(spreads, g.homeTeam) },
    moneyline: { away: sideAt(h2h, g.awayTeam), home: sideAt(h2h, g.homeTeam) },
    total: { over: sideAt(totals, "Over"), under: sideAt(totals, "Under") },
  };
}

/**
 * Every game on a slate day that has not started, with its game lines.
 * Started games drop out: nothing can be built on them any more.
 */
export async function getSlateGames(date: string): Promise<GameOption[]> {
  const { from, to } = slateBounds(date);
  return gamesBetween(new Date(Math.max(from.getTime(), Date.now())), to);
}

/**
 * The slate day of the first game on file kicking off at or after `from`, in
 * the leagues the site covers, or null when none is. NFL plays on a few days a
 * week, so this is how a page says "no games today, next up Sunday".
 *
 * Reads what's on file and never calls the feed: callers that need the week
 * filled in run ensureUpcomingOdds first.
 */
export async function nextGameDay(from: Date): Promise<string | null> {
  const [g] = await db
    .select({ commenceTime: games.commenceTime })
    .from(games)
    .where(and(gte(games.commenceTime, from), inArray(games.league, [...FEED_LEAGUES])))
    .orderBy(asc(games.commenceTime))
    .limit(1);
  return g ? slateDateString(g.commenceTime) : null;
}

/**
 * The day the board leads with: today when a game is on today's slate (played
 * or not), otherwise the next day with one. Falls back to today when nothing
 * is on file, so there is always a day to say "nothing yet" under.
 */
export async function leadGameDay(today: string): Promise<string> {
  return (await nextGameDay(slateBounds(today).from)) ?? today;
}

/** How far ahead the parlay builder looks: a full NFL week, Thursday to Monday. */
export const UPCOMING_DAYS = 7;

/** Every game in the next week that has not started — the parlay builder's list. */
export async function getUpcomingGames(days = UPCOMING_DAYS): Promise<GameOption[]> {
  const now = new Date();
  return gamesBetween(now, new Date(now.getTime() + days * 24 * 3600_000));
}

/** Games kicking off in [from, to), in the leagues the site covers, with their lines. */
async function gamesBetween(from: Date, to: Date): Promise<GameOption[]> {
  const gs = await db
    .select()
    .from(games)
    .where(
      and(
        gte(games.commenceTime, from),
        lt(games.commenceTime, to),
        gt(games.commenceTime, new Date()),
        // Games from leagues no longer covered can still be on file.
        inArray(games.league, [...FEED_LEAGUES]),
      ),
    )
    .orderBy(asc(games.commenceTime), asc(games.id));
  if (gs.length === 0) return [];

  // Every game's game lines in one query, not one per game.
  const all = await db
    .select()
    .from(lines)
    .where(
      and(
        inArray(lines.gameId, gs.map((g) => g.id)),
        eq(lines.available, true),
        inArray(lines.marketKey, [...GAME_MARKETS]),
      ),
    );
  const byGame = new Map<string, Line[]>();
  for (const l of all) byGame.set(l.gameId, [...(byGame.get(l.gameId) ?? []), l]);
  return gs
    .map((g) => gameOption(g, byGame.get(g.id) ?? []))
    // A game the books have not priced yet has nothing to pick.
    .filter((g) => g.moneyline.home || g.moneyline.away || g.spread.home || g.total.over);
}

/**
 * A player's ladder: every number any book hangs, main line and alternates
 * together, each with the best Over and best Under at exactly that number.
 */
function ladder(group: Line[]): PropRung[] {
  const byPoint = new Map<number, Line[]>();
  for (const l of group) {
    if (l.point === null) continue;
    const k = Number(l.point);
    byPoint.set(k, [...(byPoint.get(k) ?? []), l]);
  }
  return [...byPoint]
    .sort(([a], [b]) => a - b)
    .map(([point, at]) => {
      const over = best(at.filter((l) => l.outcome === "Over"));
      const under = best(at.filter((l) => l.outcome === "Under"));
      return { point, over: over ? toOption(over) : null, under: under ? toOption(under) : null };
    })
    .filter((r) => r.over || r.under);
}

/** One game's player props, grouped by market then player. */
export async function getGameProps(gameId: string): Promise<PropGroup[]> {
  const [g] = await db.select().from(games).where(eq(games.id, gameId)).limit(1);
  if (!g) return [];
  const markets = LEAGUE_CONFIG[g.league as FeedLeague]?.propMarkets ?? [];
  const alts = new Set(LEAGUE_CONFIG[g.league as FeedLeague]?.altPropMarkets ?? []);
  const ls = await db
    .select()
    .from(lines)
    .where(and(eq(lines.gameId, gameId), eq(lines.available, true)));

  const groups: PropGroup[] = [];
  for (const m of markets) {
    const inMarket = ls.filter((l) => l.marketKey === m);
    const inAlt = alts.has(`${m}_alternate`) ? ls.filter((l) => l.marketKey === `${m}_alternate`) : [];
    const players = [...new Set(inMarket.map((l) => l.player).filter((p): p is string => !!p))].sort();
    const rows: PropRow[] = players
      .map((player) => {
        const mine = inMarket.filter((l) => l.player === player);
        return {
          player,
          over: sideAt(mine, "Over"),
          under: sideAt(mine, "Under"),
          yes: sideAt(mine, "Yes"),
          ladder: ladder([...mine, ...inAlt.filter((l) => l.player === player)]),
        };
      })
      .filter((r) => r.over || r.under || r.yes);
    if (rows.length > 0) groups.push({ marketKey: m, label: PROP_LABELS[m] ?? m, rows });
  }
  return groups;
}

export type FreezeResult =
  | { ok: true; selectionId: string; gameId: string; game: Game; line: Line }
  | { ok: false; error: string; movedTo?: number };

/**
 * Freezes a line into a selection — the moment a pick or a parlay leg is
 * actually made. Re-reads the line rather than trusting the form, and refuses
 * when the price is no longer the one the person saw: odds that moved between
 * the render and the tap are a different bet, and taking it silently is how a
 * record ends up holding prices nobody chose.
 */
export async function freezeLine(lineId: string, expectedPrice: number): Promise<FreezeResult> {
  const [row] = await db
    .select({ line: lines, game: games })
    .from(lines)
    .innerJoin(games, eq(games.id, lines.gameId))
    .where(eq(lines.id, lineId))
    .limit(1);
  if (!row) return { ok: false, error: "That line is no longer offered." };
  const { line, game } = row;
  if (!line.available) return { ok: false, error: "The books have pulled that line." };
  if (game.commenceTime.getTime() <= Date.now()) {
    return { ok: false, error: `${game.awayTeam} vs ${game.homeTeam} has already started.` };
  }
  if (line.price !== expectedPrice) {
    return { ok: false, error: "The price moved.", movedTo: line.price };
  }

  const [sel] = await db
    .insert(selections)
    .values({
      gameId: line.gameId,
      // An alternate is the same bet at another number: graded, labelled
      // and deduplicated as its base market.
      marketKey: baseMarket(line.marketKey),
      outcome: line.outcome,
      player: line.player,
      point: line.point,
      price: line.price,
      book: line.book,
      bookTitle: line.bookTitle,
    })
    .onConflictDoUpdate({
      // Same bet at the same price: reuse the row, so it is graded once.
      target: [
        selections.gameId,
        selections.marketKey,
        selections.outcome,
        selections.player,
        selections.point,
        selections.price,
        selections.book,
      ],
      set: { bookTitle: line.bookTitle },
    })
    .returning({ id: selections.id });

  return { ok: true, selectionId: sel.id, gameId: line.gameId, game, line };
}

export interface PendingLeg {
  selectionId: string;
  label: string;
  event: string;
  league: string;
  price: number;
  bookTitle: string;
  commenceTime: Date;
  /** How many community parlays ride on it — what settling it unblocks. */
  parlays: number;
}

/**
 * Community legs waiting on a result an admin has to supply: started, still
 * pending, and not on Oobee's board (those settle through their pick on the
 * main list). In practice these are player props, which the feed cannot
 * grade, plus any game line whose score never arrived (a postponement).
 */
export async function getPendingCommunityLegs(limit = 50): Promise<PendingLeg[]> {
  const rows = await db
    .select({
      sel: selections,
      game: games,
      parlays: sql<number>`(select count(*)::int from ${parlaySelectionLegs} where ${parlaySelectionLegs.selectionId} = ${selections.id})`,
    })
    .from(selections)
    .innerJoin(games, eq(games.id, selections.gameId))
    .where(
      and(
        eq(selections.status, "pending"),
        lt(games.commenceTime, new Date()),
        sql`not exists (select 1 from ${picks} where ${picks.selectionId} = ${selections.id})`,
        sql`exists (select 1 from ${parlaySelectionLegs} where ${parlaySelectionLegs.selectionId} = ${selections.id})`,
      ),
    )
    .orderBy(asc(games.commenceTime))
    .limit(limit);
  return rows.map(({ sel, game, parlays }) => ({
    selectionId: sel.id,
    label: lineLabel(sel),
    event: eventLabel(game),
    league: game.league,
    price: sel.price,
    bookTitle: sel.bookTitle,
    commenceTime: game.commenceTime,
    parlays: Number(parlays),
  }));
}
