/**
 * Browser-driven flow tests for the paths that mutate the public record.
 * These exercise real server actions, not just rendering.
 *
 * There are no paid plans or billing backend — the whole tier/subscription
 * system was removed. Every account gets the same free board.
 *
 *   npm run e2e
 *
 * Leaves the database as it found it (test user removed, settled pick reopened).
 */
import { createHash, randomBytes } from "node:crypto";
import postgres from "postgres";
import { chromium } from "playwright";
// Same rule as scripts/verify.mjs: how much a viewer should see is asked of
// the app's own board logic, never restated here, so a product change to
// VISIBLE_PICKS can not leave a stale number behind. Run under tsx — see
// package.json.
import { VISIBLE_PICKS } from "../src/lib/board.ts";
import { createSlate, dropSlate, ensureTester, dropTester, slateDateString } from "./fixtures.mjs";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const sql = postgres(process.env.DATABASE_URL, { max: 1 });

/** The seeded accounts. `db:seed` creates these two and no picks at all. */
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "nemanjas@oobeebets.com";
// The seed creates the admin and nobody else; the plain user this suite needs
// to prove the admin routes are closed is built here and dropped at teardown.
const TESTER_EMAIL = (await ensureTester(sql)).email;

// This suite builds the board it acts on and drops it at the end — `db:seed`
// creates accounts only, deliberately.
const [seedAdmin] = await sql`select id from users where email = ${ADMIN_EMAIL}`;
if (!seedAdmin) {
  console.error(`\n✗ No ${ADMIN_EMAIL} account. Run: npm run db:seed\n`);
  await sql.end();
  process.exit(1);
}

const latestSlate = slateDateString();
await dropSlate(sql, latestSlate);
const { counts: slateCounts } = await createSlate(sql, {
  date: latestSlate,
  publishedBy: seedAdmin.id,
});

/**
 * What a signed-in tester is entitled to on the tab they land on. Onboarding
 * drops them at /picks with no ?category=, which is the game-bets board — the
 * props tab has its own limit and is checked in verify.mjs.
 */
const freeBoard = Math.min(VISIBLE_PICKS.game, slateCounts.game);

let failures = 0;
const check = (cond, name, extra = "") => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
  if (!cond) failures++;
};

/** Session token hashes minted here, so teardown removes only our own. */
const mintedSessions = [];

async function sessionCookie(email) {
  const [u] = await sql`select id from users where email = ${email}`;
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  await sql`insert into sessions (user_id, token_hash, expires_at)
            values (${u.id}, ${hash}, ${new Date(Date.now() + 3600_000)})`;
  mintedSessions.push(hash);
  return { name: "oobee_session", value: token, url: APP_URL, httpOnly: true, sameSite: "Lax" };
}

/**
 * A server action only fires once React has hydrated the form. Clicking before
 * that is silently swallowed — no POST, no error — so every interaction below
 * waits for the fiber React attaches during hydration.
 */
async function hydrated(page, selector = "form") {
  await page.waitForFunction(
    (sel) => {
      const el = document.querySelector(sel);
      return Boolean(el) && Object.keys(el).some((k) => k.startsWith("__react"));
    },
    selector,
    { timeout: 15_000 },
  );
}

const browser = await chromium.launch();

/* ---------------------------------------------- 1. invite -> onboarding -> board */

console.log("\nInvite onboarding and the free board");

const testEmail = `e2e-${Date.now()}@example.com`;
{
  // The token is minted the same way the app does: a random base64url token,
  // only its sha256 hash stored — see lib/auth.ts hashToken.
  const inviteToken = randomBytes(32).toString("base64url");
  const inviteTokenHash = createHash("sha256").update(inviteToken).digest("hex");
  await sql`insert into invitations (email, token_hash, status, expires_at)
            values (${testEmail}, ${inviteTokenHash}, 'pending', ${new Date(Date.now() + 3600_000)})`;

  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  await page.goto(`${APP_URL}/invite/${inviteToken}`);
  await hydrated(page);

  // Step 1 — "You're in": nothing to fill, the invited email is read-only.
  await page.click('button:has-text("Continue")');

  // Step 2 — set a password.
  await page.fill("#password", "correct-horse-battery");
  await page.fill("#confirm", "correct-horse-battery");
  await page.click('button:has-text("Continue")');

  // Step 3 — name and phone. The field formats as it's typed and the country
  // select defaults to the US, so typing bare digits should come back out as
  // a national-format number and get stored as E.164.
  await page.fill("#name", "Taylor Tester");
  await page.type("#phone-local", "6502530000");
  check(
    (await page.inputValue("#phone-local")) === "(650) 253-0000",
    "phone formats as you type",
    `value=${await page.inputValue("#phone-local")}`,
  );
  await page.click('button:has-text("Continue")');

  // Step 4 — spend band, then the real submit.
  await page.click('label:has-text("Under $50")');
  await page.click('button:has-text("Finish")');
  await page.waitForURL("**/picks**", { timeout: 15000 });

  check(page.url().includes("/picks"), "onboarding redirects to the board");

  const [created] = await sql`
    select id, role, phone, display_name, monthly_spend_band
    from users where email = ${testEmail}
  `;
  check(Boolean(created), "user row created");
  check(created?.role === "user", "new users are not admins", `role=${created?.role}`);
  check(created?.phone === "+16502530000", "phone stored as E.164", `phone=${created?.phone}`);
  check(created?.display_name === "Taylor Tester", "display name stored", `name=${created?.display_name}`);
  check(
    created?.monthly_spend_band === "under_50",
    "spend band stored",
    `band=${created?.monthly_spend_band}`,
  );

  const [invite] = await sql`select status, accepted_user_id from invitations where email = ${testEmail}`;
  check(invite?.status === "accepted", "invitation marked accepted", `status=${invite?.status}`);
  check(invite?.accepted_user_id === created?.id, "invitation links to the new user");

  // A brand-new account gets the whole free board immediately — no plan step.
  const html = await page.content();
  const unlocked = new Set([...html.matchAll(/Pick (\d+): /g)].map((m) => Number(m[1])));
  const overServed = [...unlocked].filter((r) => r > freeBoard);
  check(
    unlocked.size === freeBoard && overServed.length === 0,
    "new account sees the free board",
    `unlocked=${unlocked.size}/${freeBoard}` +
      (overServed.length ? ` OVER-SERVED:${overServed.join(",")}` : ""),
  );

  // No paid plans during beta, but /pricing is still linked from the wild.
  // It must land on the board rather than 404 — a prerendered redirect page
  // is the kind of thing a build quietly gets wrong.
  await page.goto(`${APP_URL}/pricing`);
  await page.waitForURL("**/picks**", { timeout: 15000 });
  check(page.url().includes("/picks"), "/pricing redirects to the board", page.url());

  await ctx.close();
}

/* ---------------------------------------------- 1b. /picks is gated */

console.log("\nSigned-out visitors are gated");

{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${APP_URL}/picks`);
  await page.waitForURL("**/login**", { timeout: 15000 });
  check(page.url().includes("/login"), "signed-out /picks bounces to /login", page.url());
  await ctx.close();
}

{
  // No public picks anywhere — /top-picks used to be the deliberate public
  // teaser, but it's gated the same as /picks now.
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${APP_URL}/top-picks`);
  await page.waitForURL("**/login**", { timeout: 15000 });
  check(page.url().includes("/login"), "signed-out /top-picks bounces to /login", page.url());
  await ctx.close();
}

/* --------------------------------------------------------- 2. settle flow */

console.log("\nSettling a pick");

{
  // Pick something in the future so it appears in the "not started yet" list.
  const [target] = await sql`
    select p.id, p.rank, p.category, p.selection, p.price, p.slate_date
    from picks p where p.status = 'pending'
    order by p.starts_at asc limit 1
  `;

  if (!target) {
    check(false, "found a pending pick to settle");
  } else {
    const ctx = await browser.newContext();
    await ctx.addCookies([await sessionCookie(ADMIN_EMAIL)]);
    const page = await ctx.newPage();

    await page.goto(`${APP_URL}/admin/settle`);
    await hydrated(page);
    const row = page.locator(`form:has(input[value="${target.id}"])`).first();
    await row.locator('input[name="finalScore"]').fill("4-2");
    await row.locator('button[value="won"]').click();
    await page.waitForTimeout(2500);

    const [after] = await sql`
      select status, final_score, settled_at, settled_by from picks where id = ${target.id}
    `;
    check(after.status === "won", "pick marked won", `status=${after.status}`);
    check(after.final_score === "4-2", "final score stored", `score=${after.final_score}`);
    check(Boolean(after.settled_at), "settled_at set");
    check(Boolean(after.settled_by), "settled_by records the admin");

    const [audit] = await sql`
      select action, actor_email from audit_log
      where entity_id = ${target.id} order by created_at desc limit 1
    `;
    check(audit?.action === "pick.settled.won", "audit log written", `action=${audit?.action}`);
    check(
      audit?.actor_email === ADMIN_EMAIL,
      "audit log names the actor",
      audit?.actor_email,
    );

    // The board must reflect it without any further action. There is no
    // separate public record page — settlement shows up on the same board
    // the pick was published to.
    const targetDate =
      target.slate_date instanceof Date
        ? target.slate_date.toISOString().slice(0, 10)
        : target.slate_date;
    const pub = await ctx.newPage();
    await pub.goto(`${APP_URL}/picks?date=${targetDate}&category=${target.category}`);
    const boardHtml = await pub.content();
    check(
      boardHtml.includes(target.selection),
      `settled pick appears on the ${target.category} board`,
    );

    // Restore.
    await sql`update picks set status='pending', final_score=null, settled_at=null,
              settled_by=null where id = ${target.id}`;
    await ctx.close();
  }
}

/* ------------------------------------------- 3. non-admin cannot mutate */

console.log("\nAuthorisation on mutations");

{
  const [target] = await sql`select id, status from picks where status='pending' limit 1`;
  const ctx = await browser.newContext();
  await ctx.addCookies([await sessionCookie(TESTER_EMAIL)]);
  const page = await ctx.newPage();

  // A regular (non-admin) user cannot even load the settle page.
  const res = await page.goto(`${APP_URL}/admin/settle`);
  check(res.status() === 404, "non-admin cannot open the settle page", `${res.status()}`);

  const [unchanged] = await sql`select status from picks where id = ${target.id}`;
  check(unchanged.status === "pending", "pick untouched by non-admin");
  await ctx.close();
}

/* --------------------------------------- 4. first visit must not self-reload */

console.log("\nFirst-visit stability");

{
  // Regression guard. The worker calls clients.claim() the moment it activates,
  // which fires controllerchange on a page that was never stale; reloading
  // there threw away whatever the visitor had already typed. A fresh context
  // has no worker, so this is a genuine first visit.
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const typed = "typed-before-the-worker@example.com";

  await page.goto(`${APP_URL}/login`);
  await hydrated(page);
  await page.fill("#email", typed);

  // Long enough for the worker to install, activate and claim this client.
  await page.waitForTimeout(3000);

  check(
    (await page.inputValue("#email")) === typed,
    "first visit keeps typed input (no claim-triggered reload)",
  );
  check(
    await page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    "service worker still takes control",
  );
  await ctx.close();
}

/* ------------------------------------------- 5. a second admin is a real admin */

console.log("\nMultiple admins");

const secondAdmin = `e2e-admin-${Date.now()}@example.com`;
{
  // Promoting a second account has to grant the whole panel, not a subset —
  // there is no tier above admin to withhold anything any more.
  await sql`insert into users (email, password_hash, role)
            values (${secondAdmin}, ${"x"}, 'admin')`;

  const ctx = await browser.newContext();
  await ctx.addCookies([await sessionCookie(secondAdmin)]);
  const page = await ctx.newPage();

  for (const route of ["/admin", "/admin/users", "/admin/announce"]) {
    const res = await page.goto(`${APP_URL}${route}`);
    check(res.status() === 200, `second admin opens ${route}`, `${res.status()}`);
  }

  // Both admins are listed, and the promoted one is not a special case.
  const [{ n }] = await sql`select count(*)::int as n from users where role = 'admin'`;
  check(n === 2, "two admins coexist", `admins=${n}`);
  await ctx.close();
}

/* ------------------------------------------------------------- teardown */

// The test users' own sessions cascade with their rows; only the ones minted
// above need clearing. A blanket delete here would sign out real sessions.
await sql`delete from users where email in (${testEmail}, ${secondAdmin})`;
await dropTester(sql, TESTER_EMAIL);
await sql`delete from invitations where email = ${testEmail}`;
await sql`delete from sessions where token_hash = any(${mintedSessions})`;
await dropSlate(sql, latestSlate);
await browser.close();

console.log(failures === 0 ? "\n✓ All flow tests passed.\n" : `\n✗ ${failures} failed.\n`);
await sql.end();
process.exit(failures === 0 ? 0 : 1);
