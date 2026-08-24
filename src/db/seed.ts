/**
 * Resets the database to two empty accounts: one admin, one tester.
 *
 * It seeds *accounts only*. There is deliberately no invented betting history
 * here — this product's entire claim is that its record is real, and fourteen
 * days of fabricated settled picks is the one fixture that can quietly end up
 * somewhere it is read as one. Anything that needs a slate to look at builds
 * its own; see scripts/verify.mjs and scripts/e2e.mjs, which each create and
 * tear down the picks they assert on.
 *
 * Idempotent: it clears every table first, so running it twice gives the same
 * state rather than duplicates. Never run against a database with real users.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import bcrypt from "bcryptjs";
import {
  auditLog,
  invitations,
  picks,
  rateLimits,
  sessions,
  slates,
  users,
} from "./schema";

// No default: this script deletes every row it touches. Guessing a connection
// string is exactly how a seed ends up wiping the wrong database.
function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[seed] DATABASE_URL is not set — copy .env.example to .env");
    process.exit(1);
  }
  return url;
}

/** Host and database only — never echo the password back to the terminal. */
function describeTarget(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}`;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

/**
 * main() deletes every row in seven tables, including the whole pick history —
 * which §10 of the FSD calls the company's entire asset, and which no backup
 * restores without losing a day. A stale DATABASE_URL in a shell is all it
 * takes, so seeding requires an opt-in that no deployed environment carries.
 */
function requireSeedOptIn(url: string): void {
  if (process.env.NODE_ENV === "production") {
    console.error("[seed] refusing to run: NODE_ENV=production.");
    process.exit(1);
  }
  if (process.env.ALLOW_DESTRUCTIVE_SEED !== "1") {
    console.error(
      "[seed] refusing to wipe the database.\n" +
        `       Target: ${describeTarget(url)}\n` +
        "       This deletes every user, slate, pick and audit entry.\n" +
        "       Set ALLOW_DESTRUCTIVE_SEED=1 to confirm (see .env.example).",
    );
    process.exit(1);
  }
}

const connectionString = requireDatabaseUrl();
requireSeedOptIn(connectionString);

const client = postgres(connectionString, { max: 1 });
const db = drizzle(client, {
  schema: { users, sessions, slates, picks, auditLog, rateLimits, invitations },
});

/** Overridable so a real first admin can be created without editing this file. */
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@oobeebets.com";
const TESTER_EMAIL = process.env.SEED_TESTER_EMAIL ?? "tester@example.com";
const PASSWORD = process.env.SEED_PASSWORD ?? "password123";

async function main() {
  console.log(`[seed] clearing ${describeTarget(connectionString)}...`);
  await db.delete(auditLog);
  await db.delete(rateLimits);
  await db.delete(picks);
  await db.delete(slates);
  await db.delete(sessions);
  await db.delete(invitations);
  await db.delete(users);

  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  const created = await db
    .insert(users)
    .values([
      { email: ADMIN_EMAIL, passwordHash, role: "admin", emailVerifiedAt: new Date() },
      { email: TESTER_EMAIL, passwordHash, role: "user", emailVerifiedAt: new Date() },
    ])
    .returning({ id: users.id, email: users.email, role: users.role });

  console.log(`[seed] done — ${created.length} accounts, no slates, no picks.`);
  console.log("");
  console.log(`  Sign in with either (password: ${PASSWORD})`);
  for (const u of created) {
    console.log(`    ${u.email.padEnd(24)} ${u.role}`);
  }
  console.log("");
  console.log("  The board is empty. Build today's slate at /admin/slate.");
  console.log("");

  await client.end();
}

main().catch(async (err) => {
  console.error("[seed] failed:", err);
  await client.end();
  process.exit(1);
});
