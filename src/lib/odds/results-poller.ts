import { ensureScores } from "./sync";

/**
 * Grades finished games on a timer, so results no longer wait for someone to
 * open /picks, /my-bets or /admin/settle.
 *
 * That used to be the only trigger, and the feed's scores endpoint only
 * reaches back three days: when nobody visited in that window — as happened
 * with the 6–8 October slates — the games aged out and had to be settled by
 * hand. Page loads still call refreshResults() as before; the claim in
 * odds_sync makes the two share one fetch rather than double up.
 *
 * RESULTS_POLL_MINUTES sets the interval (default 30); 0 turns it off. The
 * credit cost is bounded inside ensureScores, which only asks the feed while a
 * bet is waiting on a game and backs off once a game looks postponed.
 */
const POLL_MINUTES = () => {
  const n = Number(process.env.RESULTS_POLL_MINUTES ?? 30);
  return Number.isFinite(n) && n >= 0 ? n : 30;
};

/** First run shortly after boot rather than a full interval later. */
const FIRST_RUN_MS = 60_000;

const KEY = Symbol.for("oobee.resultsPoller");
type WithPoller = typeof globalThis & { [KEY]?: NodeJS.Timeout };

async function tick() {
  try {
    const settled = await ensureScores();
    if (settled > 0) console.log(`[results] settled ${settled} bet${settled === 1 ? "" : "s"}`);
  } catch (err) {
    console.error("[results] poll failed:", err);
  }
}

export function startResultsPoller(): void {
  const minutes = POLL_MINUTES();
  if (minutes === 0) return;
  // Dev re-runs instrumentation on reload; one timer per process is enough.
  const g = globalThis as WithPoller;
  if (g[KEY]) return;

  g[KEY] = setInterval(tick, minutes * 60_000);
  // Neither timer should keep the process alive on shutdown.
  g[KEY].unref();
  setTimeout(tick, FIRST_RUN_MS).unref();
  console.log(`[results] polling every ${minutes} min`);
}
