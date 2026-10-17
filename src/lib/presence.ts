import "server-only";
import { db } from "@/db";
import { userActiveDays } from "@/db/schema";
import { slateDateString } from "@/lib/slate-date";

/**
 * Which slate day each account was last recorded as active, in this process.
 * Bounded by the number of accounts; a restart only costs one no-op insert
 * per account on its next request.
 */
const recorded = new Map<string, string>();

/**
 * Marks an account active today (user_active_days), once per account per
 * slate day. Called by getAuth on every signed-in request, so the common case
 * — already recorded — is a map lookup and nothing else. Never awaited and
 * never throws: presence is bookkeeping, not part of the request.
 */
export function notePresence(userId: string, now: Date = new Date()): void {
  const day = slateDateString(now);
  if (recorded.get(userId) === day) return;
  recorded.set(userId, day);
  db.insert(userActiveDays)
    .values({ day, userId })
    .onConflictDoNothing()
    .catch((err) => {
      // Try again on the next request rather than losing the day.
      recorded.delete(userId);
      console.error("[presence]", err instanceof Error ? err.message : err);
    });
}
