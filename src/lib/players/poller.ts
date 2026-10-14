import { statsConfigured } from "./balldontlie";
import { LEAGUES, SEASON_TYPES, currentSeason } from "./catalog";
import { ensureSeason } from "./sync";

/**
 * Keeps the Players tables filled without anyone waiting on the provider:
 * every STATS_POLL_MINUTES (default 360, 0 = off) it brings each league's
 * seasons up to date — the current one, and STATS_SEASONS_BACK before it
 * (default 4), which is also how a fresh database gets its history. Each
 * season is claimed in odds_sync with its own TTL (sync.ts), so a pass over
 * seasons that are already fresh costs a query each and no calls.
 *
 * Leagues run side by side, since each has its own rate limit; seasons within
 * a league run one after another. A pass still going when the next is due is
 * left to finish rather than doubled up.
 */
const POLL_MINUTES = () => {
  const n = Number(process.env.STATS_POLL_MINUTES ?? 360);
  return Number.isFinite(n) && n >= 0 ? n : 360;
};

const SEASONS_BACK = () => {
  const n = Number(process.env.STATS_SEASONS_BACK ?? 4);
  return Number.isFinite(n) && n >= 0 ? Math.min(Math.floor(n), 20) : 4;
};

/** First run a little after the results poller's, so boot isn't one burst. */
const FIRST_RUN_MS = 90_000;

const KEY = Symbol.for("oobee.statsPoller");
type WithPoller = typeof globalThis & { [KEY]?: NodeJS.Timeout };

async function tick(state: { running: boolean }) {
  if (state.running) return;
  state.running = true;
  try {
    await Promise.all(
      LEAGUES.map(async (cfg) => {
        const newest = currentSeason(cfg);
        for (let season = newest; season >= newest - SEASONS_BACK(); season--) {
          for (const type of SEASON_TYPES) {
            try {
              await ensureSeason(cfg.league, season, type);
            } catch (err) {
              console.error(`[stats] ${cfg.league} ${season} ${type} failed:`, err);
            }
          }
        }
      }),
    );
  } finally {
    state.running = false;
  }
}

export function startStatsPoller(): void {
  const minutes = POLL_MINUTES();
  if (minutes === 0 || !statsConfigured()) return;
  // Dev re-runs instrumentation on reload; one timer per process is enough.
  const g = globalThis as WithPoller;
  if (g[KEY]) return;

  const state = { running: false };
  const timer = setInterval(() => void tick(state), minutes * 60_000);
  // Neither timer should keep the process alive on shutdown.
  timer.unref();
  setTimeout(() => void tick(state), FIRST_RUN_MS).unref();
  g[KEY] = timer;
  console.log(`[stats] polling every ${minutes} min, ${SEASONS_BACK()} seasons back`);
}
