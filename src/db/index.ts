import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env, or run `docker compose up`.",
  );
}

/**
 * Next dev reloads modules on every edit; without this the pool leaks
 * connections until Postgres refuses new ones.
 */
const globalForDb = globalThis as unknown as {
  __oobeeSql?: ReturnType<typeof postgres>;
};

/** Empty or non-numeric falls back to 10: `Number("")` is 0, which would cap
 * the pool at nothing, and `??` does not catch an empty environment value. */
function poolMax(): number {
  const parsed = Number(process.env.DB_POOL_MAX);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10;
}

const client =
  globalForDb.__oobeeSql ??
  postgres(connectionString, {
    max: poolMax(),
    idle_timeout: 20,
    connect_timeout: 10,
    // Vertical scaling knob: raise DB_POOL_MAX per instance, but keep
    // (instances x DB_POOL_MAX) under Postgres max_connections, or put
    // PgBouncer in front. See README "Scaling".
  });

if (process.env.NODE_ENV !== "production") globalForDb.__oobeeSql = client;

export const db = drizzle(client, { schema });
export { schema };
