/**
 * POC verification suite. Run against a seeded database with the app serving
 * on APP_URL:
 *
 *   npm run build && npm start &
 *   npm run verify
 *
 * Checks the things that would actually cost money if they broke:
 *   1. Settlement maths — every stat on the site is a sum of this.
 *   2. Board visibility — picks past the free limit must not be in the
 *      response at all, on /picks or on either /top-picks tab, and the
 *      board's own contract, called directly.
 *   3. Access control — /admin must not be reachable by a normal user.
 *   4. Session handling — /picks is gated: no session, or a dead one, sends
 *      the request to /login instead of rendering anything.
 */
import { createHash, randomBytes } from "node:crypto";
import postgres from "postgres";
// The app's own board logic, imported rather than re-described. Everything
// this file expects a viewer to see is computed from it, so a product change
// to VISIBLE_PICKS can never leave a stale number behind in here. Run under
// tsx — see package.json.
import { VISIBLE_PICKS, visiblePicks } from "../src/lib/board.ts";
import { createSlate, dropSlate, slateDateString } from "./fixtures.mjs";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const sql = postgres(process.env.DATABASE_URL, { max: 1 });

/** The seeded accounts. `db:seed` creates these two and no picks at all. */
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@oobeebets.com";
const TESTER_EMAIL = process.env.SEED_TESTER_EMAIL ?? "tester@example.com";

/* -------------------------------------------------------------- fixtures */

// The suite builds the board it asserts on, then removes it. Nothing in the
// database is assumed beyond the two accounts.
const [admin] = await sql`select id from users where email = ${ADMIN_EMAIL}`;
if (!admin) {
  console.error(`\n✗ No ${ADMIN_EMAIL} account. Run: npm run db:seed\n`);
  await sql.end();
  process.exit(1);
}

const today = slateDateString();
await dropSlate(sql, today);
await createSlate(sql, { date: today, publishedBy: admin.id });

let failures = 0;
const pass = (name, extra = "") => console.log(`  PASS  ${name}${extra ? "  " + extra : ""}`);
const fail = (name, extra = "") => {
  failures++;
  console.log(`  FAIL  ${name}${extra ? "  " + extra : ""}`);
};
const check = (cond, name, extra) => (cond ? pass(name, extra) : fail(name, extra));

/** /picks redirects here for anyone without a live session — see the guard
 * at the top of src/app/(site)/picks/page.tsx. */
function redirectsToLogin(res) {
  const location = res.headers.get("location") ?? "";
  return { ok: res.status >= 300 && res.status < 400 && location.startsWith("/login"), location };
}

/* ------------------------------------------------------ 1. settlement maths */

console.log("\nSettlement maths");

// Mirrors src/lib/settlement.ts. If these two ever disagree, the public record
// disagrees with itself.
function profitUnits(price, units, status) {
  switch (status) {
    case "won":
      return price > 0 ? units * (price / 100) : units * (100 / Math.abs(price));
    case "lost":
      return -units;
    default:
      return 0;
  }
}

const near = (a, b) => Math.abs(a - b) < 1e-9;

check(near(profitUnits(150, 1, "won"), 1.5), "+150 @ 1u won = +1.50u");
check(near(profitUnits(-120, 1, "won"), 0.8333333333333334), "-120 @ 1u won = +0.83u");
check(near(profitUnits(-110, 1, "won"), 0.9090909090909091), "-110 @ 1u won = +0.909u");
check(near(profitUnits(200, 2.5, "won"), 5), "+200 @ 2.5u won = +5.00u");
check(near(profitUnits(150, 1, "lost"), -1), "any price @ 1u lost = -1.00u");
check(near(profitUnits(-110, 2, "lost"), -2), "-110 @ 2u lost = -2.00u");
check(near(profitUnits(150, 1, "push"), 0), "push = 0");
check(near(profitUnits(150, 1, "void"), 0), "void = 0");
check(near(profitUnits(150, 1, "pending"), 0), "pending = 0");

// Cross-check the DB aggregate used on the landing page against the same maths
// applied row by row — these are two independent implementations.
const rows = await sql`
  select p.price, p.units, p.status from picks p
  join slates s on s.date = p.slate_date and s.published_at is not null
`;
const manual = rows.reduce(
  (acc, r) => acc + profitUnits(r.price, Number(r.units), r.status),
  0,
);
const [{ agg }] = await sql`
  select coalesce(sum(
    case
      when p.status = 'won' and p.price > 0 then p.units * (p.price::numeric / 100)
      when p.status = 'won' and p.price < 0 then p.units * (100 / abs(p.price)::numeric)
      when p.status = 'lost' then -p.units
      else 0
    end
  ), 0)::float as agg
  from picks p
  join slates s on s.date = p.slate_date and s.published_at is not null
`;
check(
  Math.abs(manual - agg) < 1e-6,
  "SQL aggregate matches row-by-row maths",
  `js=${manual.toFixed(4)} sql=${agg.toFixed(4)}`,
);

/* ------------------------------------------------------- 2. board visibility */

console.log("\nBoard visibility (picks past the free limit must be absent from the payload)");

const [{ n: total }] = await sql`
  select count(*)::int as n from picks where slate_date = ${today}
`;

async function sessionFor(email) {
  const [user] = await sql`select id from users where email = ${email}`;
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await sql`
    insert into sessions (user_id, token_hash, expires_at)
    values (${user.id}, ${tokenHash}, ${new Date(Date.now() + 3600_000)})
  `;
  return { token, cleanup: () => sql`delete from sessions where token_hash = ${tokenHash}` };
}

/**
 * Rank comes from the rendered aria-label, not from matching selection text:
 * the fixture reuses selections across ranks, so text matching false-positives.
 */
const servedRanks = (html) =>
  new Set([...html.matchAll(/Pick (\d+): /g)].map((m) => Number(m[1])));

/** Ranks 1..expected, no more and no fewer. */
function rankDiff(served, expected) {
  const over = [...served].filter((r) => r > expected);
  const missing = [];
  for (let r = 1; r <= expected; r++) if (!served.has(r)) missing.push(r);
  return { over, missing, ok: over.length === 0 && missing.length === 0 };
}

const reportRanks = (name, served, expected) => {
  const { over, missing, ok } = rankDiff(served, expected);
  check(
    ok,
    name.padEnd(22),
    `unlocked=${served.size}/${expected}` +
      (over.length ? ` OVER-SERVED:${over.join(",")}` : "") +
      (missing.length ? ` MISSING:${missing.join(",")}` : ""),
  );
};

/** The whole seed: one admin and one tester. There is no third role. */
const DEMO_EMAILS = [ADMIN_EMAIL, TESTER_EMAIL];

const viewers = await sql`
  select email, role from users where email = any(${DEMO_EMAILS}) order by email
`;

check(
  viewers.length === DEMO_EMAILS.length,
  "every demo account exists",
  `${viewers.length}/${DEMO_EMAILS.length}`,
);

/** Mirrors visiblePicks' admin bypass; the limit itself is asked of the app. */
const expectedFor = ({ role }) =>
  role === "admin" ? total : Math.min(VISIBLE_PICKS, total);

for (const viewer of viewers) {
  const { token, cleanup } = await sessionFor(viewer.email);
  const html = await (
    await fetch(`${APP_URL}/picks`, { headers: { cookie: `oobee_session=${token}` } })
  ).text();
  reportRanks(viewer.email, servedRanks(html), expectedFor(viewer));
  await cleanup();
}

{
  const res = await fetch(`${APP_URL}/picks`, { redirect: "manual" });
  const { ok, location } = redirectsToLogin(res);
  check(ok, "(anonymous) is gated".padEnd(22), `-> ${res.status} ${location}`);
}

// No public picks anywhere — /top-picks was the deliberate public teaser,
// now gated the same as /picks.
{
  const res = await fetch(`${APP_URL}/top-picks`, { redirect: "manual" });
  const { ok, location } = redirectsToLogin(res);
  check(ok, "(anonymous) /top-picks is gated".padEnd(22), `-> ${res.status} ${location}`);
}

/* ------------------------------------------- 2a. the same limit, per sport */

/**
 * /top-picks filters the slate by sport and the free limit is a cut on rank,
 * which runs across the whole slate rather than within one sport. So an
 * MLB-heavy top 15 leaves the NFL tab holding fewer than 15 rows, and "the
 * first 15 rows for this sport" would quietly serve ranks past the limit.
 * A signed-in tester must never see a rank above VISIBLE_PICKS on either tab.
 */
console.log("\nBoard visibility on /top-picks (per-sport tabs share one rank cut)");

for (const sport of ["mlb", "nfl"]) {
  const { token, cleanup } = await sessionFor(TESTER_EMAIL);
  const html = await (
    await fetch(`${APP_URL}/top-picks?sport=${sport}`, {
      headers: { cookie: `oobee_session=${token}` },
    })
  ).text();
  const served = [...servedRanks(html)];
  const over = served.filter((r) => r > VISIBLE_PICKS);
  check(
    over.length === 0,
    `tester /top-picks?sport=${sport}`.padEnd(30),
    `served=${served.length}` + (over.length ? ` OVER-SERVED:${over.join(",")}` : ""),
  );
  await cleanup();
}

/* --------------------------------------------------- 2b. the board's own contract */

console.log("\nBoard contract (visiblePicks, called directly)");

{
  // Deliberately five ranks past the free limit, so there is always something
  // to truncate however VISIBLE_PICKS is configured.
  const beyond = VISIBLE_PICKS + 5;
  const sample = Array.from({ length: beyond }, (_, i) => ({ rank: i + 1 }));

  const nonAdmin = visiblePicks(sample, false);
  check(
    nonAdmin.length === VISIBLE_PICKS,
    "non-admin sees exactly VISIBLE_PICKS",
    `served=${nonAdmin.length}/${VISIBLE_PICKS}`,
  );

  // The bypass the picks page depends on when an admin previews a draft slate.
  const admin = visiblePicks(sample, true);
  check(
    admin.length === beyond,
    "admins bypass the limit entirely",
    `served=${admin.length}/${beyond}`,
  );
}

/* -------------------------------------------------------- 3. access control */

console.log("\nAccess control");

const adminRoutes = ["/admin", "/admin/slate", "/admin/settle", "/admin/users", "/admin/announce"];

{
  for (const route of adminRoutes) {
    const res = await fetch(`${APP_URL}${route}`, { redirect: "manual" });
    // 404, not 403 — a non-admin should not learn the route exists.
    check(res.status === 404, `anonymous ${route}`, `-> ${res.status}`);
  }

  const { token, cleanup } = await sessionFor(TESTER_EMAIL);
  for (const route of adminRoutes) {
    const res = await fetch(`${APP_URL}${route}`, {
      headers: { cookie: `oobee_session=${token}` },
      redirect: "manual",
    });
    check(res.status === 404, `tester ${route}`, `-> ${res.status}`);
  }
  await cleanup();

  // One admin role, and it opens everything — including the two surfaces that
  // used to be owner-only.
  const admin = await sessionFor(ADMIN_EMAIL);
  const cookie = { cookie: `oobee_session=${admin.token}` };

  for (const route of adminRoutes) {
    const res = await fetch(`${APP_URL}${route}`, { headers: cookie });
    check(res.status === 200, `admin ${route}`.padEnd(24), `-> ${res.status}`);
  }
  await admin.cleanup();
}

/* ------------------------------------------------------ 3b. the role model */

console.log("\nRole model");

{
  const roles = await sql`
    select enumlabel from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'role' order by e.enumsortorder
  `;
  const labels = roles.map((r) => r.enumlabel);
  check(
    labels.length === 2 && labels.includes("user") && labels.includes("admin"),
    "role enum is exactly user + admin",
    labels.join(","),
  );
  check(!labels.includes("owner"), "owner is gone from the enum");

  // Plural admins are the point of the change, so prove the model allows it
  // rather than trusting that dropping the enum value was enough.
  const [{ id: extraId }] = await sql`
    insert into users (email, password_hash, role)
    values (${"second-admin@example.com"}, ${"x"}, 'admin') returning id
  `;
  const [{ n }] = await sql`select count(*)::int as n from users where role = 'admin'`;
  check(n >= 2, "more than one admin can exist at once", `admins=${n}`);
  await sql`delete from users where id = ${extraId}`;
}

/* ---------------------------------------------------------- 4. expired session */

console.log("\nSession handling");

{
  const [user] = await sql`select id from users where email = ${TESTER_EMAIL}`;
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await sql`
    insert into sessions (user_id, token_hash, expires_at)
    values (${user.id}, ${tokenHash}, ${new Date(Date.now() - 1000)})
  `;
  const expired = await fetch(`${APP_URL}/picks`, {
    headers: { cookie: `oobee_session=${token}` },
    redirect: "manual",
  });
  const expiredResult = redirectsToLogin(expired);
  check(expiredResult.ok, "expired session is gated", `-> ${expired.status} ${expiredResult.location}`);
  await sql`delete from sessions where token_hash = ${tokenHash}`;

  const garbage = await fetch(`${APP_URL}/picks`, {
    headers: { cookie: "oobee_session=not-a-real-token" },
    redirect: "manual",
  });
  const garbageResult = redirectsToLogin(garbage);
  check(garbageResult.ok, "forged cookie is rejected, gated", `-> ${garbage.status} ${garbageResult.location}`);
}

/* ---------------------------------------------------------------- teardown */

// The fixture slate is removed whether the run passed or failed — leaving a
// board of invented picks behind is exactly what dropping the seed avoided.
await dropSlate(sql, today);

/* ------------------------------------------------------------------ result */

console.log(
  failures === 0
    ? `\n✓ All checks passed (slate ${today}, ${total} picks).\n`
    : `\n✗ ${failures} check(s) failed.\n`,
);

await sql.end();
process.exit(failures === 0 ? 0 : 1);
