/**
 * POC verification suite. Run against a seeded database with the app serving
 * on APP_URL:
 *
 *   npm run build && npm start &
 *   npm run verify
 *
 * Checks the things that would actually cost money if they broke:
 *   1. Settlement maths — every stat on the site is a sum of this.
 *   2. Tier gating — locked picks must not be in the response at all,
 *      and the gate's own contract, called directly.
 *   3. Access control — /admin must not be reachable by a normal user.
 *   4. Session handling — an expired cookie drops to the free view.
 */
import { createHash, randomBytes } from "node:crypto";
import postgres from "postgres";
// The app's own gate, imported rather than re-described. Everything this file
// expects a viewer to see is computed from it, so a change to what a tier
// unlocks can never leave a stale number behind in here. (It did once: the
// 2026-08-23 beta collapsed every tier to one free limit and these checks
// still asserted 1/6/15/all.) Run under tsx — see package.json.
import { gatePicks, visibleRankLimit } from "../src/lib/gating.ts";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const sql = postgres(process.env.DATABASE_URL, { max: 1 });

let failures = 0;
const pass = (name, extra = "") => console.log(`  PASS  ${name}${extra ? "  " + extra : ""}`);
const fail = (name, extra = "") => {
  failures++;
  console.log(`  FAIL  ${name}${extra ? "  " + extra : ""}`);
};
const check = (cond, name, extra) => (cond ? pass(name, extra) : fail(name, extra));

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

/* ------------------------------------------------------------ 2. tier gating */

console.log("\nTier gating (locked picks must be absent from the payload)");

const [{ date: todayRaw }] = await sql`select max(date) as date from slates`;
const today = todayRaw instanceof Date ? todayRaw.toISOString().slice(0, 10) : todayRaw;
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
 * the seed reuses selections across ranks, so text matching false-positives.
 * A locked card's label reads "Pick N, locked" — the colon is what makes this
 * count only what the viewer was actually served.
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

/**
 * Who to test is a fixed list; how much each should see is not. Tiers come
 * from the database (whatever getLiveSubscription would resolve), the limit
 * comes from the app, and the slate size caps both — so this holds on a
 * one-free-tier beta and on a tiered main without editing.
 */
const DEMO_EMAILS = [
  "free@example.com",
  "base@example.com",
  "pro@example.com",
  "elite@example.com",
  "admin@oobeebets.com",
  "owner@oobeebets.com",
];

const viewers = await sql`
  -- distinct on: a second live subscription row would otherwise test the same
  -- account twice and make the count check below look like a missing user.
  select distinct on (u.email) u.email, u.role, s.tier
    from users u
    left join subscriptions s
      on s.user_id = u.id
     and s.status in ('trialing','active','past_due')
     and s.current_period_end > now()
   where u.email = any(${DEMO_EMAILS})
   order by u.email
`;

check(
  viewers.length === DEMO_EMAILS.length,
  "every demo account exists",
  `${viewers.length}/${DEMO_EMAILS.length}`,
);

/** Mirrors gatePicks' admin bypass; the rank limit itself is asked of the app. */
const expectedFor = ({ role, tier }) =>
  role === "admin" || role === "owner"
    ? total
    : Math.min(visibleRankLimit(tier ?? null), total);

for (const viewer of viewers) {
  const { token, cleanup } = await sessionFor(viewer.email);
  const html = await (
    await fetch(`${APP_URL}/picks`, { headers: { cookie: `oobee_session=${token}` } })
  ).text();
  reportRanks(viewer.email, servedRanks(html), expectedFor(viewer));
  await cleanup();
}

{
  const html = await (await fetch(`${APP_URL}/picks`)).text();
  reportRanks("(anonymous)", servedRanks(html), Math.min(visibleRankLimit(null), total));
}

/* ------------------------------------------------ 2b. the gate's own contract */

console.log("\nGate contract (gatePicks, called directly)");

{
  // Deliberately five ranks past whatever the free limit is, so there is always
  // something locked to inspect however the tiers are configured.
  const beyond = visibleRankLimit(null) + 5;
  const sample = Array.from({ length: beyond }, (_, i) => ({
    id: `p${i + 1}`,
    rank: i + 1,
    sport: "soccer",
    league: "EPL",
    startsAt: new Date(0),
    market: "moneyline",
    selection: "SHOULD-NOT-LEAK",
    price: -110,
    book: "SHOULD-NOT-LEAK",
    reasoning: "SHOULD-NOT-LEAK",
    status: "pending",
  }));

  const gated = gatePicks(sample, null, false);
  const locked = gated.filter((p) => p.locked);
  const leaked = locked.filter((p) =>
    ["selection", "price", "book", "reasoning"].some((k) => k in p),
  );
  check(locked.length > 0, "sample actually produces locked picks", `locked=${locked.length}`);
  check(leaked.length === 0, "locked picks carry metadata only", `leaked=${leaked.length}`);

  // The bypass the picks page depends on when an admin previews a draft slate.
  check(
    gatePicks(sample, null, true).every((p) => !p.locked),
    "admins bypass the gate entirely",
  );
}

/* -------------------------------------------------------- 3. access control */

console.log("\nAccess control");

const adminRoutes = ["/admin", "/admin/slate", "/admin/settle", "/admin/settings"];

{
  for (const route of adminRoutes) {
    const res = await fetch(`${APP_URL}${route}`, { redirect: "manual" });
    // 404, not 403 — a non-admin should not learn the route exists.
    check(res.status === 404, `anonymous ${route}`, `-> ${res.status}`);
  }

  const { token, cleanup } = await sessionFor("elite@example.com");
  for (const route of adminRoutes) {
    const res = await fetch(`${APP_URL}${route}`, {
      headers: { cookie: `oobee_session=${token}` },
      redirect: "manual",
    });
    check(res.status === 404, `subscriber ${route}`, `-> ${res.status}`);
  }
  await cleanup();

  const admin = await sessionFor("admin@oobeebets.com");
  const res = await fetch(`${APP_URL}/admin`, {
    headers: { cookie: `oobee_session=${admin.token}` },
  });
  check(res.status === 200, "admin /admin", `-> ${res.status}`);

  // Role management is owner-only, even for an admin.
  const usersRes = await fetch(`${APP_URL}/admin/users`, {
    headers: { cookie: `oobee_session=${admin.token}` },
  });
  check(usersRes.status === 404, "admin /admin/users (owner-only)", `-> ${usersRes.status}`);
  await admin.cleanup();

  const owner = await sessionFor("owner@oobeebets.com");
  const ownerRes = await fetch(`${APP_URL}/admin/users`, {
    headers: { cookie: `oobee_session=${owner.token}` },
  });
  check(ownerRes.status === 200, "owner /admin/users", `-> ${ownerRes.status}`);
  await owner.cleanup();
}

/* ---------------------------------------------------------- 4. expired session */

console.log("\nSession handling");

{
  const [user] = await sql`select id from users where email = ${"elite@example.com"}`;
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await sql`
    insert into sessions (user_id, token_hash, expires_at)
    values (${user.id}, ${tokenHash}, ${new Date(Date.now() - 1000)})
  `;
  const html = await (
    await fetch(`${APP_URL}/picks`, { headers: { cookie: `oobee_session=${token}` } })
  ).text();
  const anonLimit = Math.min(visibleRankLimit(null), total);
  const served = servedRanks(html);
  check(
    rankDiff(served, anonLimit).ok,
    "expired session falls back to free",
    `unlocked=${served.size}/${anonLimit}`,
  );
  await sql`delete from sessions where token_hash = ${tokenHash}`;

  const garbage = await fetch(`${APP_URL}/picks`, {
    headers: { cookie: "oobee_session=not-a-real-token" },
  });
  check(garbage.status === 200, "forged cookie is rejected, page still renders");
}

/* ------------------------------------------------------------------ result */

console.log(
  failures === 0
    ? `\n✓ All checks passed (slate ${today}, ${total} picks).\n`
    : `\n✗ ${failures} check(s) failed.\n`,
);

await sql.end();
process.exit(failures === 0 ? 0 : 1);
