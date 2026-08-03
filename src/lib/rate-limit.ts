import "server-only";
import { lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { rateLimits } from "@/db/schema";

/**
 * Abuse control for the two forms this site still has.
 *
 * Lifted out of lib/auth.ts, which went with the rest of the product: there
 * are no accounts, sessions or passwords in the pre-launch build, and keeping
 * three hundred lines of session handling around for the two functions the
 * signup form needs was the definition of dead weight.
 *
 * This is also the only reason the pre-launch site still talks to Postgres.
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

  await db.delete(rateLimits).where(lt(rateLimits.windowStart, windowStart));

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
