/**
 * Resets the database to a single empty admin account.
 *
 * It seeds *accounts only*. There is deliberately no invented betting history
 * here — this product's entire claim is that its record is real, and fourteen
 * days of fabricated settled picks is the one fixture that can quietly end up
 * somewhere it is read as one. Anything that needs a slate to look at builds
 * its own; see scripts/verify.mjs and scripts/e2e.mjs, which each create and
 * tear down the picks they assert on.
 *
 * There is no seeded tester either: a second account existed only for the test
 * suites, and they now build and drop their own (see ensureTester in
 * scripts/fixtures.mjs), so no login the seed creates outlives a run.
 *
 * Idempotent: it clears every table first, so running it twice gives the same
 * state rather than duplicates. Never run against a database with real users.
 */
import { randomBytes } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import bcrypt from "bcryptjs";
import {
  auditLog,
  invitations,
  parlayLegs,
  parlays,
  pickFollows,
  picks,
  postLikes,
  posts,
  rateLimits,
  sessions,
  slates,
  userFollows,
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
 * main() deletes every row in ten tables, including the whole pick history —
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
  schema: {
    users,
    sessions,
    slates,
    picks,
    pickFollows,
    parlays,
    parlayLegs,
    auditLog,
    rateLimits,
    invitations,
  },
});

/** Overridable so a different first admin can be created without editing this
 * file. Every later admin is promoted from /admin/users by an existing one. */
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "nemanjas@oobeebets.com";

// No fixed default: a password written down here is one that every copy of the
// repo knows, and this account is a full admin. Unset, the seed mints a random
// one and prints it below — usable, and impossible to guess ahead of time.
const PASSWORD = process.env.SEED_PASSWORD ?? randomBytes(9).toString("base64url");
const PASSWORD_IS_GENERATED = !process.env.SEED_PASSWORD;

async function main() {
  console.log(`[seed] clearing ${describeTarget(connectionString)}...`);
  await db.delete(auditLog);
  await db.delete(rateLimits);
  // Before picks and users, both of which it cascades from. Named explicitly
  // anyway: this function claims to clear every table, and a reader should be
  // able to check that claim against this list rather than against two foreign
  // keys three files away.
  await db.delete(pickFollows);
  // The social tables all cascade from users and posts; listed for the same
  // reason as everything else here.
  await db.delete(postLikes);
  await db.delete(userFollows);
  await db.delete(posts);
  // Legs before parlays before picks: each cascades from the next, but the
  // list is the claim this function makes about itself and should be readable
  // without chasing foreign keys.
  await db.delete(parlayLegs);
  await db.delete(parlays);
  await db.delete(picks);
  await db.delete(slates);
  await db.delete(sessions);
  await db.delete(invitations);
  await db.delete(users);

  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  const [created] = await db
    .insert(users)
    .values({
      email: ADMIN_EMAIL,
      // The local part, reduced to what users_username_format accepts.
      username: ADMIN_EMAIL.split("@")[0].toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 20).padEnd(3, "_"),
      passwordHash,
      role: "admin",
      emailVerifiedAt: new Date(),
    })
    .returning({ id: users.id, email: users.email, role: users.role });

  console.log("[seed] done — 1 account, no slates, no picks.");
  console.log("");
  console.log("  Sign in as");
  console.log(`    ${created.email}  (${created.role}, password: ${PASSWORD})`);
  if (PASSWORD_IS_GENERATED) {
    console.log("    ^ generated for this run only — set SEED_PASSWORD in .env to pin it.");
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
