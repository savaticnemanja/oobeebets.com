/**
 * Runs once when the server starts. Only the Node runtime gets background
 * work — the edge runtime (middleware) has no long-lived process to run it in.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startResultsPoller } = await import("@/lib/odds/results-poller");
  startResultsPoller();
  const { startStatsPoller } = await import("@/lib/players/poller");
  startStatsPoller();
}
