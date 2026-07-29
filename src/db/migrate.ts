/**
 * Standalone migration runner. Executed by the container entrypoint before the
 * server starts, and by `npm run db:migrate` locally.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// No default. A fallback URL silently points migrations at whatever else is
// listening on the default port, which is how you migrate the wrong database.
function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[migrate] DATABASE_URL is not set — copy .env.example to .env");
    process.exit(1);
  }
  return url;
}

const connectionString = requireDatabaseUrl();

async function main() {
  // max: 1 — migrations must run on a single connection, sequentially.
  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);

  console.log("[migrate] running migrations...");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("[migrate] done");

  await client.end();
}

main().catch((err) => {
  console.error("[migrate] failed:", err);
  process.exit(1);
});
