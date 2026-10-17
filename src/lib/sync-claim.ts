import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { oddsSync } from "@/db/schema";

/**
 * The right to refresh one slice of an outside feed — the odds feed's
 * "odds:MLB:2026-10-07", the stats feed's "stats:NBA:2025:regular" — so a
 * burst of visitors (or a visitor and a poller) costs the provider one call,
 * not one each. Both feeds keep their timestamps in odds_sync; see its note
 * in db/schema.ts.
 */

/**
 * Takes the right to refresh `key` if it is older than `ttlMin`. True for
 * exactly one caller per window — the update's WHERE is the lock.
 */
export async function claim(key: string, ttlMin: number): Promise<boolean> {
  const rows = await db.execute<{ key: string }>(sql`
    insert into ${oddsSync} (key, synced_at) values (${key}, now())
    on conflict (key) do update set synced_at = now(), last_error = null
    where ${oddsSync.syncedAt} < now() - make_interval(mins => ${ttlMin})
    returning key
  `);
  return rows.length > 0;
}

/**
 * A failed refresh retries after two minutes rather than a whole TTL.
 * `tag` prefixes the log line ("odds", "stats").
 */
export async function release(key: string, ttlMin: number, err: unknown, tag = "odds") {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[${tag}] ${key}: ${message}`);
  await db
    .update(oddsSync)
    .set({
      syncedAt: sql`now() - make_interval(mins => ${Math.max(0, ttlMin - 2)})`,
      lastError: message.slice(0, 500),
    })
    .where(eq(oddsSync.key, key));
}
