import type { ActionState } from "@/lib/validation";

/**
 * Runs a server action from a toggle — a like, a follow, a tick, a vote — so
 * that a throw comes back as a failed result rather than an error.
 *
 * These run inside startTransition, and React sends anything thrown there to
 * the nearest error boundary: one dropped connection or one database hiccup
 * on a like used to replace the whole page with the error screen. As a result
 * it is a toast, and the optimistic value falls back on its own.
 */
export async function tryAction(run: () => Promise<ActionState>): Promise<ActionState> {
  try {
    return await run();
  } catch {
    return { ok: false, error: "That didn't go through — check your connection and try again." };
  }
}
