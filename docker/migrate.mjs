/**
 * Runtime migration runner — plain ESM so the production image needs no
 * TypeScript toolchain. `src/db/migrate.ts` is the dev-time equivalent.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[migrate] DATABASE_URL is not set");
  process.exit(1);
}

const client = postgres(url, { max: 1 });

try {
  console.log("[migrate] applying migrations...");
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  console.log("[migrate] up to date");
  await client.end();
} catch (err) {
  console.error("[migrate] failed:", err);
  await client.end({ timeout: 5 });
  process.exit(1);
}
