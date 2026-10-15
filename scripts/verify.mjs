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
 *      response at all, on either /picks tab, and
 *      the board's own contract, called directly. Each /picks tab must also
 *      serve its own board and nothing from the other one.
 *   3. Access control — /admin must not be reachable by a normal user.
 *   4. Session handling — /picks is gated: no session, or a dead one, sends
 *      the request to /login instead of rendering anything.
 *   5. Follow tracking — "I took this bet" is a dataset we will make decisions
 *      from, so the rules that keep it honest: the window closes at kick-off,
 *      one row per tester per pick, follows die with what they point at, and
 *      an admin's own ticks never land in the tester cohort.
 *   6. Parlays — a ticket is only as trustworthy as its legs, so: the grade is
 *      derived and never stored, a leg cannot appear twice, ranks are unique
 *      to Oobee's board only, and a tester's parlay can never be ranked onto
 *      it.
 */
import { createHash, randomBytes } from "node:crypto";
import postgres from "postgres";
// The app's own board logic, imported rather than re-described. Everything
// this file expects a viewer to see is computed from it, so a product change
// to VISIBLE_PICKS can never leave a stale number behind in here. Run under
// tsx — see package.json.
import {
  CATEGORY_LABELS,
  PICKS_PER_SLATE,
  VISIBLE_PICKS,
  pickCategories,
  visiblePicks,
} from "../src/lib/board.ts";
import { FOLLOW_STAKE_UNITS, followWindowOpen } from "../src/lib/follows.ts";
import { combineOdds } from "../src/lib/settlement.ts";
import { ACCESS, TIERS, TIER_ORDER, tierForLookupKey, tierForRank } from "../src/lib/tiers.ts";
import { WEBHOOK_EVENTS } from "../src/lib/billing/events.ts";
import Stripe from "stripe";
import { safeNextPath } from "../src/lib/safe-next.ts";
import { NFL_TEAM_ABBR, gradeProp, playerKey } from "../src/lib/odds/props.ts";
import { FEED_LEAGUES, SCORES_SPORT_KEYS } from "../src/lib/odds/markets.ts";
import { LEAGUE_BY_NAME } from "../src/lib/players/catalog.ts";
import {
  NHL_STAT_NAMES,
  mlbGameRow,
  mlbSeasonRow,
  nbaGameRow,
  nbaSeasonRow,
  nflGameRow,
  nflSeasonRow,
  nhlGameRow,
  nhlSeasonRow,
} from "../src/lib/players/bdl-map.ts";
import { americanToDecimal, decimalToAmerican } from "../src/lib/settlement.ts";
import {
  MAX_PARLAY_LEGS,
  MIN_PARLAY_LEGS,
  parlayPrice,
  parlayProfit,
  parlayStatus,
  parlayWindowOpen,
} from "../src/lib/parlays.ts";
import {
  FIXTURE_SELECTIONS,
  createSlate,
  dropSlate,
  ensureTester,
  dropTester,
  slateDateString,
  STATS_SEASON,
  seedStatsFixture,
  dropStatsFixture,
} from "./fixtures.mjs";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const sql = postgres(process.env.DATABASE_URL, { max: 1 });

/** The seeded account. `db:seed` creates this one admin and no picks at all. */
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "nemanjas@oobeebets.com";

/* -------------------------------------------------------------- fixtures */

// The suite builds the board it asserts on and the plain user that views it,
// then removes both. Nothing in the database is assumed beyond the admin.
const [admin] = await sql`select id from users where email = ${ADMIN_EMAIL}`;
if (!admin) {
  console.error(`\n✗ No ${ADMIN_EMAIL} account. Run: npm run db:seed\n`);
  await sql.end();
  process.exit(1);
}

const TESTER_EMAIL = (await ensureTester(sql)).email;

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

// A league can leave the menu with bets still open in it; the results
// poller must still be able to grade those (SCORES_SPORT_KEYS).
const gradable = await sql`select distinct g.league from selections s join games g on g.id = s.game_id where s.status = 'pending'`;
const ungradable = [...new Set([...FEED_LEAGUES, ...gradable.map((r) => r.league)])].filter((l) => !SCORES_SPORT_KEYS[l]);
check(ungradable.length === 0, "every league with open bets can still be graded", ungradable.length ? `no scores key: ${ungradable}` : "");

/* ------------------------------------------------------- 2. board visibility */

console.log("\nBoard visibility (picks past the free limit must be absent from the payload)");

const tallies = await sql`
  select category, count(*)::int as n from picks
  where slate_date = ${today} group by category
`;
const totals = Object.fromEntries(
  pickCategories.map((c) => [c, tallies.find((r) => r.category === c)?.n ?? 0]),
);
const total = tallies.reduce((n, r) => n + r.n, 0);

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

/** One of each role: the seeded admin and the fixture tester. There is no third. */
const DEMO_EMAILS = [ADMIN_EMAIL, TESTER_EMAIL];

const viewers = await sql`
  select email, role from users where email = any(${DEMO_EMAILS}) order by email
`;

check(
  viewers.length === DEMO_EMAILS.length,
  "both viewer roles exist",
  `${viewers.length}/${DEMO_EMAILS.length}`,
);

/** Mirrors visiblePicks' admin bypass; the limit itself is asked of the app. */
const expectedFor = ({ role }, category) =>
  role === "admin" ? totals[category] : Math.min(VISIBLE_PICKS[category], totals[category]);

/** Selections belonging to the board that is *not* being requested. */
const foreignSelections = (category) =>
  pickCategories.filter((c) => c !== category).flatMap((c) => FIXTURE_SELECTIONS[c]);

for (const category of pickCategories) {
  for (const viewer of viewers) {
    const { token, cleanup } = await sessionFor(viewer.email);
    const html = await (
      await fetch(`${APP_URL}/picks?category=${category}`, {
        headers: { cookie: `oobee_session=${token}` },
      })
    ).text();

    reportRanks(
      `${viewer.email} · ${category}`,
      servedRanks(html),
      expectedFor(viewer, category),
    );

    // Both boards are ranked 1..15, so matching ranks alone cannot tell them
    // apart — a tab serving the wrong list would look perfect above. The
    // selections are what actually distinguish them.
    const leaked = foreignSelections(category).filter((sel) => html.includes(sel));
    check(
      leaked.length === 0,
      `${CATEGORY_LABELS[category]} tab holds only its own board`.padEnd(46),
      leaked.length ? `LEAKED:${leaked.join(" | ")}` : `${viewer.email}`,
    );
    await cleanup();
  }
}

// An unknown ?category= must land on a real board rather than an empty one —
// categoryFromParam falls back to game bets.
{
  const { token, cleanup } = await sessionFor(TESTER_EMAIL);
  const html = await (
    await fetch(`${APP_URL}/picks?category=not-a-board`, {
      headers: { cookie: `oobee_session=${token}` },
    })
  ).text();
  const served = servedRanks(html);
  check(
    served.size === Math.min(VISIBLE_PICKS.game, totals.game),
    "unknown ?category= falls back to game bets",
    `served=${served.size}`,
  );
  await cleanup();
}

{
  const res = await fetch(`${APP_URL}/picks`, { redirect: "manual" });
  const { ok, location } = redirectsToLogin(res);
  check(ok, "(anonymous) is gated".padEnd(22), `-> ${res.status} ${location}`);
}

/* --------------------------------------------------- 2b. the board's own contract */

console.log("\nBoard contract (visiblePicks, called directly)");

for (const category of pickCategories) {
  // Deliberately five ranks past the free limit, so there is always something
  // to truncate however VISIBLE_PICKS is configured.
  const limit = VISIBLE_PICKS[category];
  const beyond = limit + 5;
  const sample = Array.from({ length: beyond }, (_, i) => ({ rank: i + 1, category }));

  const nonAdmin = visiblePicks(sample, false);
  check(
    nonAdmin.length === limit,
    `non-admin sees exactly VISIBLE_PICKS.${category}`,
    `served=${nonAdmin.length}/${limit}`,
  );

  // The bypass the picks page depends on when an admin previews a draft slate.
  const admin = visiblePicks(sample, true);
  check(
    admin.length === beyond,
    `admins bypass the ${category} limit entirely`,
    `served=${admin.length}/${beyond}`,
  );
}

{
  // A mixed list is the case a single shared limit would get wrong: each row
  // has to be cut against its own board, not against whichever limit the
  // caller happened to have in hand.
  const mixed = pickCategories.flatMap((category) =>
    Array.from({ length: VISIBLE_PICKS[category] + 3 }, (_, i) => ({
      rank: i + 1,
      category,
    })),
  );
  const kept = visiblePicks(mixed, false);
  const wrong = kept.filter((p) => p.rank > VISIBLE_PICKS[p.category]);
  check(
    wrong.length === 0 &&
      kept.length === pickCategories.reduce((n, c) => n + VISIBLE_PICKS[c], 0),
    "a mixed list is cut per category",
    `kept=${kept.length}` + (wrong.length ? ` OVER:${wrong.length}` : ""),
  );
}

/* --------------------------------------------------- 2c. plans (lib/tiers.ts) */

console.log("\nPlans contract (lib/tiers.ts)");

{
  // Each plan sees at least what the one below it does, list by list.
  const ladder = ["free", ...TIER_ORDER];
  for (let i = 1; i < ladder.length; i++) {
    const [lo, hi] = [ACCESS[ladder[i - 1]], ACCESS[ladder[i]]];
    check(
      pickCategories.every((c) => hi.picks[c] >= lo.picks[c]) && (!lo.parlays || hi.parlays),
      `${ladder[i]} sees everything ${ladder[i - 1]} does`,
    );
  }
  check(
    pickCategories.every((c) => ACCESS.elite.picks[c] === PICKS_PER_SLATE[c]),
    "Elite reaches the whole slate",
    pickCategories.map((c) => `${c} ${ACCESS.elite.picks[c]}/${PICKS_PER_SLATE[c]}`).join(", "),
  );
  check(pickCategories.every((c) => ACCESS.free.picks[c] >= 1), "free still sees the #1 of each list");

  // The board, cut per plan: a full slate served at each depth.
  for (const access of ["free", ...TIER_ORDER]) {
    const slate = pickCategories.flatMap((category) =>
      Array.from({ length: PICKS_PER_SLATE[category] }, (_, i) => ({ rank: i + 1, category })),
    );
    const kept = visiblePicks(slate, false, ACCESS[access].picks);
    const over = kept.filter((p) => p.rank > ACCESS[access].picks[p.category]);
    check(
      over.length === 0 && kept.length === pickCategories.reduce((n, c) => n + ACCESS[access].picks[c], 0),
      `${access} is served exactly its depth`.padEnd(30),
      `kept=${kept.length}`,
    );
  }

  // The unlock prompt names the cheapest plan that opens the next pick.
  for (const category of pickCategories) {
    for (const access of ["free", "base", "pro"]) {
      const next = tierForRank(category, ACCESS[access].picks[category] + 1);
      check(
        next && ACCESS[next].picks[category] > ACCESS[access].picks[category],
        `past ${access}'s ${category}s, ${next} unlocks the next`,
      );
    }
  }

  // Lookup keys round-trip: the webhook maps a Price back to its tier.
  check(TIER_ORDER.every((t) => tierForLookupKey(TIERS[t].lookupKey) === t), "every lookup key maps back to its tier");
  check(tierForLookupKey("someone_elses_price") === null, "a foreign price maps to no tier");
}

/* ------------------------------------------------- 2d. the Stripe webhook */

console.log("\nStripe webhook (/api/webhooks/stripe)");

{
  const hook = (body, headers = {}) =>
    fetch(`${APP_URL}/api/webhooks/stripe`, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/json", ...headers },
      body,
    });

  const payload = JSON.stringify({ id: "evt_verify", object: "event", type: "customer.created", data: { object: {} } });
  let res = await hook(payload);
  check(res.status === 400, "unsigned delivery is refused", `-> ${res.status}`);
  res = await hook(payload, { "stripe-signature": "t=1,v1=forged" });
  check(res.status === 400, "forged signature is refused", `-> ${res.status}`);

  // With the endpoint's secret in hand, a properly signed event of a type the
  // app ignores is acknowledged — and touches nothing.
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (secret) {
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
    res = await hook(payload, { "stripe-signature": header });
    check(res.status === 200, "signed delivery is accepted", `-> ${res.status}`);
  } else {
    console.log("  SKIP  signed delivery (no STRIPE_WEBHOOK_SECRET)");
  }

  check(
    WEBHOOK_EVENTS.includes("customer.subscription.deleted") && WEBHOOK_EVENTS.includes("checkout.session.completed"),
    "the endpoint listens for checkout and cancellations",
  );
}

/* -------------------------------------------------------- 3. access control */

console.log("\nAccess control");

const adminRoutes = ["/admin", "/admin/slate", "/admin/settle", "/admin/users", "/admin/announce", "/admin/feedback"];

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

console.log("\nRedirect targets (safeNextPath)");

{
  // Every one of these is somewhere else once a browser resolves it.
  for (const v of ["//evil.com", "/\\evil.com", "/\t/evil.com", "/.//evil.com", "/..//evil.com", "/%2e//evil.com", "/./\\evil.com", "https://evil.com", "evil.com"]) {
    check(safeNextPath(v) === null, `refuses ${JSON.stringify(v)}`, `-> ${JSON.stringify(safeNextPath(v))}`);
  }
  for (const [v, want] of [["/picks", "/picks"], ["/stats?tab=parlays", "/stats?tab=parlays"], ["/u/rob19#replies", "/u/rob19#replies"], ["/a/../picks", "/picks"]]) {
    check(safeNextPath(v) === want, `keeps ${JSON.stringify(v)}`, `-> ${JSON.stringify(safeNextPath(v))}`);
  }
}

console.log("\nPlayer props graded from box scores");

{
  const g = (marketKey, outcome, point, stats) => gradeProp({ marketKey, outcome, point }, stats)?.status ?? null;
  check(g("player_pass_yds", "Over", 249.5, { pass_yds: 287 }) === "won", "over passing yards, cleared");
  check(g("player_pass_yds", "Under", 249.5, { pass_yds: 287 }) === "lost", "under passing yards, cleared");
  check(g("player_receptions", "Over", 5, { rec: 5 }) === "push", "a whole-number line hit exactly pushes");
  check(g("player_receptions", "Over", 4.5, {}) === "lost", "no catches in the box score counts as zero");
  check(g("player_anytime_td", "Yes", null, { rec_td: 1 }) === "won", "anytime TD on a receiving score");
  check(g("player_anytime_td", "Yes", null, { rush_td: 0, rec_td: 0 }) === "lost", "anytime TD, kept out of the end zone");
  check(g("player_anytime_td", "No", null, { rush_td: 2 }) === "lost", "no-TD side loses on a score");
  check(g("player_pass_tds", "Over", 1.5, { pass_td: 1, rush_td: 1 }) === "lost", "a rushing TD doesn't count as a passing one");
  check(g("player_pass_yds", "Over", null, { pass_yds: 300 }) === null, "a prop with no line is left for an admin");
  check(g("player_tackles", "Over", 5.5, { tkl: 9 }) === null, "a market it doesn't know is left for an admin");

  check(playerKey("A.J. Brown") === playerKey("AJ Brown"), "initials match with or without dots");
  check(playerKey("Marvin Harrison Jr.") === playerKey("Marvin Harrison"), "suffixes don't stop a match");
  check(playerKey("Amon-Ra St. Brown") === playerKey("Amon-Ra St Brown"), "hyphens and abbreviations match");
  check(playerKey("Josh Allen") === playerKey("Josh Allen"), "the same name is the same key (team decides the rest)");
  check(Object.keys(NFL_TEAM_ABBR).length === 32 && new Set(Object.values(NFL_TEAM_ABBR)).size === 32, "all 32 NFL teams map to a distinct abbreviation");
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
    insert into users (email, password_hash, role, username)
    values (${"second-admin@example.com"}, ${"x"}, 'admin', 't_' || substr(md5(random()::text), 1, 12)) returning id
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

/* ------------------------------------------------------- 5. follow tracking */

console.log("\nFollow tracking (\"I took this bet\")");

// Set inside the block, read after teardown: the cascade is only observable
// once the pick it hangs off has actually been deleted.
let followedPickId = null;

{
  // The window rule, called directly. This is the only thing standing between
  // a dataset of pre-kick-off decisions and one a tester can edit after the
  // final whistle, so it is asserted against the app's own function rather
  // than re-described here.
  const ahead = new Date(Date.now() + 3600_000);
  const behind = new Date(Date.now() - 3600_000);

  check(
    followWindowOpen({ startsAt: ahead, status: "pending" }),
    "pending pick before kick-off is open",
  );
  check(
    !followWindowOpen({ startsAt: behind, status: "pending" }),
    "pending pick after kick-off is closed",
  );
  for (const status of ["won", "lost", "push", "void"]) {
    check(
      !followWindowOpen({ startsAt: ahead, status }),
      `${status} pick is closed even before kick-off`,
    );
  }
  check(
    Number(FOLLOW_STAKE_UNITS) === 1,
    "beta record is flat-staked at one unit",
    `FOLLOW_STAKE_UNITS=${FOLLOW_STAKE_UNITS}`,
  );

  // A pending pick from the fixture slate to hang rows off.
  const [pick] = await sql`
    select id from picks
    where slate_date = ${today} and status = 'pending'
    order by rank limit 1
  `;
  const [tester] = await sql`select id from users where email = ${TESTER_EMAIL}`;
  const [adminRow] = await sql`select id from users where email = ${ADMIN_EMAIL}`;

  // One row per tester per pick. Without this the same tap landing twice —
  // a double click, two tabs — would count the bet twice in every figure.
  await sql`insert into pick_follows (user_id, pick_id) values (${tester.id}, ${pick.id})`;
  await sql`
    insert into pick_follows (user_id, pick_id) values (${tester.id}, ${pick.id})
    on conflict do nothing
  `;
  const [{ n: dupes }] = await sql`
    select count(*)::int as n from pick_follows
    where user_id = ${tester.id} and pick_id = ${pick.id}
  `;
  check(dupes === 1, "a pick cannot be followed twice by one tester", `rows=${dupes}`);

  // Admin ticks are product use, not evidence. Mirrors the cohort join in
  // getFollowAnalytics / getSlateTakeRates — if these two disagree, the admin
  // report quietly counts the operator as a tester.
  await sql`insert into pick_follows (user_id, pick_id) values (${adminRow.id}, ${pick.id})`;
  const [{ n: all }] = await sql`
    select count(*)::int as n from pick_follows where pick_id = ${pick.id}
  `;
  const [{ n: cohort }] = await sql`
    select count(u.id)::int as n from pick_follows f
    join users u on u.id = f.user_id and u.role = 'user'
    where f.pick_id = ${pick.id}
  `;
  check(
    all === 2 && cohort === 1,
    "an admin's own follow is outside the tester cohort",
    `rows=${all} cohort=${cohort}`,
  );

  // Unchecking is a delete — absence is the "no", so there is no tombstone to
  // leave behind and nothing for the analytics to have to filter out.
  await sql`
    delete from pick_follows where user_id = ${tester.id} and pick_id = ${pick.id}
  `;
  const [{ n: afterUncheck }] = await sql`
    select count(*)::int as n from pick_follows
    where user_id = ${tester.id} and pick_id = ${pick.id}
  `;
  check(afterUncheck === 0, "unchecking removes the row", `rows=${afterUncheck}`);

  // Both foreign keys cascade. A follow pointing at a deleted pick, or a
  // deleted account, would be a row the analytics joins away silently — a
  // count that drifts from the truth with no error anywhere.
  const [throwaway] = await sql`
    insert into users (email, password_hash, role, username)
    values (${"fixture-follower@oobeebets.test"}, ${"x"}, 'user', 't_' || substr(md5(random()::text), 1, 12))
    on conflict (email) do update set role = 'user'
    returning id
  `;
  await sql`insert into pick_follows (user_id, pick_id) values (${throwaway.id}, ${pick.id})`;
  await sql`delete from users where id = ${throwaway.id}`;
  const [{ n: afterUserDelete }] = await sql`
    select count(*)::int as n from pick_follows where user_id = ${throwaway.id}
  `;
  check(afterUserDelete === 0, "deleting an account takes its follows", `rows=${afterUserDelete}`);

  // The admin row is still on `pick`, deliberately: teardown has to take it.
  const [{ n: beforeSlateDrop }] = await sql`
    select count(*)::int as n from pick_follows where pick_id = ${pick.id}
  `;
  check(beforeSlateDrop === 1, "follow survives until its pick does not", `rows=${beforeSlateDrop}`);
  followedPickId = pick.id;
}

/* --------------------------------------------------------------- 6. parlays */

console.log("\nParlays");

{
  const [tester] = await sql`select id from users where email = ${TESTER_EMAIL}`;
  const legs = await sql`
    select id, price from picks
    where slate_date = ${today} and status = 'pending' and starts_at > now()
    order by rank limit 3
  `;

  // A parlay is its legs. The database stores no grade, so the only way the
  // board and a tester's record can agree is by both deriving it -- asserted
  // here against the app's own function rather than restated.
  check(
    parlayStatus([{ price: -110, status: "won" }, { price: -110, status: "lost" }]) === "lost",
    "one lost leg sinks the ticket",
  );
  check(
    parlayPrice([{ price: -110, status: "won" }, { price: -110, status: "push" }]) === -110,
    "a pushed leg drops out and the rest reprice",
  );
  check(combineOdds([-110, -110, -110]) === 596, "three -110 legs price at +596");
  check(combineOdds([100, 100]) === 300, "two coin-flips price at +300");
  check(combineOdds([]) === null, "no legs has no price (never a free bet)");

  // The conversion underneath it has to be lossless, or every parlay price on
  // the site is quietly wrong. -100 is the one exception and is checked as the
  // normalisation it is, not waved through.
  const roundTripFailures = [];
  for (let price = -2000; price <= 2000; price++) {
    if (price > -100 && price < 100) continue;
    if (price === -100) continue;
    if (decimalToAmerican(americanToDecimal(price)) !== price) roundTripFailures.push(price);
  }
  check(
    roundTripFailures.length === 0,
    "every legal price round-trips through decimal",
    roundTripFailures.length ? `broken=${roundTripFailures.slice(0, 5).join(",")}` : "",
  );
  check(
    decimalToAmerican(americanToDecimal(-100)) === 100,
    "-100 normalises to +100 — the same bet at evens",
  );

  // A ticket where every leg is no-action is void, not a winner. Getting this
  // backwards would pay out on parlays that never ran.
  check(
    parlayStatus([{ price: -110, status: "push" }, { price: -110, status: "void" }]) === "void",
    "a ticket of pushes and voids is void, not won",
  );
  check(
    parlayStatus([{ price: -110, status: "lost" }, { price: -110, status: "pending" }]) === "lost",
    "a lost leg settles the ticket without waiting for the rest",
  );
  check(
    parlayProfit([{ price: 100, status: "won" }, { price: 100, status: "won" }], 1) === 3,
    "+100 twice at 1u pays +3.00u",
  );
  check(
    parlayProfit([{ price: -110, status: "push" }, { price: -110, status: "void" }], 1) === 0,
    "a void ticket pays nothing and costs nothing",
  );

  // The window shuts on the earliest leg, so nothing can be bolted onto a
  // game already in progress.
  const soon = new Date(Date.now() + 3600_000);
  const gone = new Date(Date.now() - 3600_000);
  check(
    parlayWindowOpen([{ startsAt: soon, status: "pending" }, { startsAt: soon, status: "pending" }]),
    "every leg ahead of kick-off -> open",
  );
  check(
    !parlayWindowOpen([{ startsAt: gone, status: "pending" }, { startsAt: soon, status: "pending" }]),
    "one leg under way -> closed, so nothing attaches to a winner",
  );

  const [{ no_status: noStatus }] = await sql`
    select count(*)::int as no_status from information_schema.columns
    where table_name = 'parlays' and column_name in ('status', 'settled_at')
  `;
  check(noStatus === 0, "parlays table stores no grade at all", `grade columns=${noStatus}`);

  // A tester's parlay.
  const [built] = await sql`
    insert into parlays (owner_id, slate_date) values (${tester.id}, ${today}) returning id
  `;
  await sql`
    insert into parlay_legs (parlay_id, pick_id)
    select ${built.id}, id from picks where id = any(${legs.map((l) => l.id)})
  `;
  const [{ n: legCount }] = await sql`
    select count(*)::int as n from parlay_legs where parlay_id = ${built.id}
  `;
  check(legCount === legs.length, "legs attach to the parlay", `legs=${legCount}`);

  // The same pick twice would square its odds and invent money no book pays.
  let dupeRejected = false;
  try {
    await sql`insert into parlay_legs (parlay_id, pick_id) values (${built.id}, ${legs[0].id})`;
  } catch {
    dupeRejected = true;
  }
  check(dupeRejected, "a pick cannot be a leg of the same parlay twice");

  // A tester's parlay is never ranked, so it can never land on Oobee's board.
  let rankedUserRejected = false;
  try {
    await sql`update parlays set rank = 1 where id = ${built.id}`;
  } catch {
    rankedUserRejected = true;
  }
  check(rankedUserRejected, "a tester's parlay cannot be given a board rank");

  // ...and Oobee's must be ranked, by the same constraint read the other way.
  let unrankedOobeeRejected = false;
  try {
    await sql`insert into parlays (owner_id, slate_date) values (null, ${today})`;
  } catch {
    unrankedOobeeRejected = true;
  }
  check(unrankedOobeeRejected, "one of Oobee's parlays cannot be unranked");

  // Rank 1 is unique among Oobee's only -- which is what lets every tester
  // hold an unranked ticket on the same day.
  const [oobee1] = await sql`
    insert into parlays (owner_id, slate_date, rank) values (null, ${today}, 1) returning id
  `;
  let dupeRankRejected = false;
  try {
    await sql`insert into parlays (owner_id, slate_date, rank) values (null, ${today}, 1)`;
  } catch {
    dupeRankRejected = true;
  }
  check(dupeRankRejected, "two of Oobee's parlays cannot share a rank");

  const [second] = await sql`
    insert into parlays (owner_id, slate_date) values (${tester.id}, ${today}) returning id
  `;
  check(Boolean(second), "testers can each hold an unranked parlay the same day");

  check(
    MIN_PARLAY_LEGS === 2 && MAX_PARLAY_LEGS === 10,
    "leg bounds are the ones the UI enforces",
    `${MIN_PARLAY_LEGS}..${MAX_PARLAY_LEGS}`,
  );

  // Deleting a leg's pick must take the leg with it: a leg pointing at nothing
  // would silently reprice every parlay containing it.
  await sql`delete from picks where id = ${legs[0].id}`;
  const [{ n: afterPickDelete }] = await sql`
    select count(*)::int as n from parlay_legs where pick_id = ${legs[0].id}
  `;
  check(afterPickDelete === 0, "deleting a pick takes the legs pointing at it", `rows=${afterPickDelete}`);

  await sql`delete from parlays where id = any(${[built.id, oobee1.id, second.id]})`;
}

/* -------------------------------------------------------------- 7. players */

console.log("\nPlayers");

{
  for (const route of ["/players", "/players/nfl/fx-1"]) {
    const res = await fetch(`${APP_URL}${route}`, { redirect: "manual" });
    const { ok, location } = redirectsToLogin(res);
    check(ok, `(anonymous) ${route} is gated`, `-> ${res.status} ${location}`);
  }

  // The catalog and the mapper agree: every column a table shows, sorts by or
  // qualifies on is a key the mapper writes — so no column reads "—" for
  // everyone because of a typo on one side. A row whose every field is 1
  // stands in for the provider.
  const any = (known = {}) => new Proxy(known, { get: (t, k) => (k in t ? t[k] : 1) });
  const game = { id: 1, date: "2025-01-01T00:00:00Z", home_team_id: 1, visitor_team_id: 2, home_team: { id: 1 }, visitor_team: { id: 2 }, away_team: { id: 2 } };
  const keysOf = (...rows) => new Set(rows.flatMap((r) => Object.keys(r?.stats ?? {})));
  const season = {
    NBA: keysOf(nbaSeasonRow(any({ player: { id: 1 }, stats: any() }))),
    NFL: keysOf(nflSeasonRow(any({ player: { id: 1 } }), "X")),
    MLB: keysOf(mlbSeasonRow(any({ player: { id: 1 } }), new Map())),
    NHL: keysOf(
      ...["C", "G"].map((position) =>
        nhlSeasonRow({ id: "1", name: "x", position, teamAbbr: null }, NHL_STAT_NAMES.map((name) => ({ name, value: 1 }))),
      ),
    ),
  };
  const games = {
    NBA: keysOf(nbaGameRow(any({ game, team: { id: 1 } }), new Map())),
    NFL: keysOf(nflGameRow(any({ game, team: { id: 1 } }))),
    MLB: keysOf(mlbGameRow(any({ game_id: 1, team: { id: 1 } }), new Map([[1, { id: 1, date: game.date, season: 2025 }]]))),
    NHL: keysOf(nhlGameRow(any({ game: { ...game, start_time_utc: game.date }, team: { id: 1 } }))),
  };
  // Every league the catalog defines, not just the ones switched on, so a
  // league comes back ready.
  for (const cfg of Object.values(LEAGUE_BY_NAME)) {
    const wanted = cfg.categories.flatMap((c) => [...c.columns.map((x) => x.key), c.sort, c.has, c.qualify.key, ...c.headline]);
    const missing = [...new Set(wanted.filter((k) => !season[cfg.league].has(k)))];
    check(missing.length === 0, `${cfg.league} table columns come from the feed`, missing.length ? `missing: ${missing}` : "");
    const gameMissing = [...new Set(cfg.categories.flatMap((c) => c.gameColumns.map((x) => x.key)).filter((k) => !games[cfg.league].has(k)))];
    check(gameMissing.length === 0, `${cfg.league} game-log columns come from the feed`, gameMissing.length ? `missing: ${gameMissing}` : "");
  }

  // The pages, against an invented season (fixtures.mjs).
  await seedStatsFixture(sql);
  const { token, cleanup } = await sessionFor(TESTER_EMAIL);
  const get = (path) => fetch(`${APP_URL}${path}`, { headers: { cookie: `oobee_session=${token}` }, redirect: "manual" });
  const base = `/players?sport=nfl&season=${STATS_SEASON}`;
  const has = (html, n) => html.includes(`Fixture Player ${String(n).padStart(2, "0")}`);

  let res = await get(base);
  let html = await res.text();
  check(res.status === 200 && has(html, 1) && !has(html, 55), "qualified table leaves out short samples", `-> ${res.status}`);

  html = await (await get(`${base}&all=1`)).text();
  check(has(html, 50) && !has(html, 51), "All players: first 50 rows, the rest left to scroll");

  html = await (await get(`${base}&all=1&sort=pass_yds&dir=asc`)).text();
  check(html.indexOf("Fixture Player 60") >= 0 && html.indexOf("Fixture Player 60") < html.indexOf("Fixture Player 59"), "sorting ascending puts the fewest yards first");

  html = await (await get(`${base}&q=Player%2007`)).text();
  check(has(html, 7) && !has(html, 8), "search narrows the table");

  res = await get("/players?sport=zzz&season=abc&cat=nope&sort=x%27%3Bdrop&dir=sideways&type=bad&q=%25_");
  check(res.status === 200, "unknown params fall back to defaults", `-> ${res.status}`);

  res = await get(`/players/nfl/fx-1?season=${STATS_SEASON}`);
  html = await res.text();
  check(res.status === 200 && has(html, 1) && html.includes("Game log") && html.includes("OPP"), "player page: seasons and game log", `-> ${res.status}`);

  // NFL only: the other leagues' pages are gone, not just unlinked.
  for (const path of ["/players/nfl/no-such-player", "/players/zzz/fx-1", "/players/nba/fx-1"]) {
    res = await get(path);
    check(res.status === 404, `${path} is a 404`, `-> ${res.status}`);
  }

  await cleanup();
  await dropStatsFixture(sql);
}

/* ---------------------------------------------------------------- teardown */

// The fixture slate is removed whether the run passed or failed — leaving a
// board of invented picks behind is exactly what dropping the seed avoided.
await dropSlate(sql, today);
await dropTester(sql, TESTER_EMAIL);

// One follow was left pointing at a fixture pick on purpose, and it is checked
// after the slate is gone rather than before: ON DELETE CASCADE is the whole
// reason dropSlate is enough teardown for this table, and a row surviving here
// would mean every later run started against a dirty dataset.
if (followedPickId) {
  const [{ n: left }] = await sql`
    select count(*)::int as n from pick_follows where pick_id = ${followedPickId}
  `;
  check(left === 0, "deleting a pick takes its follows", `rows=${left}`);
}

/* ------------------------------------------------------------------ result */

console.log(
  failures === 0
    ? `\n✓ All checks passed (slate ${today}, ${total} picks: ` +
      pickCategories.map((c) => `${totals[c]} ${c}`).join(", ") +
      `).\n`
    : `\n✗ ${failures} check(s) failed.\n`,
);

await sql.end();
process.exit(failures === 0 ? 0 : 1);
