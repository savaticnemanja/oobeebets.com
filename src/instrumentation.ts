import type { Instrumentation } from "next";

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

/**
 * Server errors (render, route handler, server action) become tickets in the
 * external tracker (lib/tracker.ts) — once per kind of error a day, at most
 * 30 an hour. Nothing happens without TRACKER_API_KEY. Loaded lazily so the
 * edge runtime never pulls it in.
 */
let gate: ((e: { message: string; stack?: string }) => boolean) | undefined;

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.TRACKER_API_KEY) return;
  try {
    const { errorGate, errorTicket, pathOnly, sendTicket } = await import("@/lib/tracker");
    const { SITE } = await import("@/lib/site");
    const e = err instanceof Error ? err : new Error(String(err));
    gate ??= errorGate();
    if (!gate({ message: e.message, stack: e.stack })) return;
    sendTicket(
      errorTicket(
        {
          message: e.message,
          stack: e.stack,
          digest: (err as { digest?: unknown }).digest ? String((err as { digest?: unknown }).digest) : undefined,
          method: request.method,
          path: pathOnly(request.path),
          route: context.routePath,
          routeType: context.routeType,
        },
        SITE.url,
      ),
    );
  } catch (e) {
    console.error("[tracker] error report failed", e instanceof Error ? e.message : e);
  }
};
