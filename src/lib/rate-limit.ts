import "server-only";
import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { rateLimits } from "@/db/schema";

/**
 * Abuse control, shared by every form that has one.
 *
 * Lifted out of lib/auth.ts during the pre-launch strip, and kept out of it
 * now the product is back: the newsletter signup rate-limits itself and has no
 * business importing three hundred lines of session handling to do it.
 * lib/auth.ts re-exports both functions so its own callers are unaffected.
 *
 * Buckets currently in use: login, invite, announce, beta-gate, and the
 * newsletter's signup and unsubscribe forms.
 */

export function clientIp(h: Headers): string {
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "unknown"
  );
}

/**
 * Fixed-window counter in Postgres. Good enough at this scale and it needs no
 * extra infrastructure; swap the body for Redis if the app ever runs hot.
 * Returns true when the caller is allowed to proceed.
 */
export async function rateLimit(
  bucket: string,
  identifier: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowMs);

  // Scoped to this bucket. Sweeping the whole table with *this* caller's window
  // meant a short-window bucket deleted a long-window bucket's live rows, which
  // silently resets that limit to zero — harmless while every bucket used
  // fifteen minutes, and a hole the moment one doesn't. Each bucket collects
  // its own expired rows on its next call instead.
  await db
    .delete(rateLimits)
    .where(and(eq(rateLimits.bucket, bucket), lt(rateLimits.windowStart, windowStart)));

  const [row] = await db
    .insert(rateLimits)
    .values({ bucket, identifier, count: 1, windowStart: now })
    .onConflictDoUpdate({
      target: [rateLimits.bucket, rateLimits.identifier],
      set: {
        count: sql`case
          when ${rateLimits.windowStart} < ${windowStart.toISOString()}::timestamptz
          then 1
          else ${rateLimits.count} + 1
        end`,
        windowStart: sql`case
          when ${rateLimits.windowStart} < ${windowStart.toISOString()}::timestamptz
          then ${now.toISOString()}::timestamptz
          else ${rateLimits.windowStart}
        end`,
      },
    })
    .returning({ count: rateLimits.count });

  return (row?.count ?? 1) <= limit;
}
