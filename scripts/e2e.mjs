/**
 * Browser-driven flow tests for the paths that mutate money or the public
 * record. These exercise real server actions, not just rendering.
 *
 * Beta has no paid plans, so there is no subscribe flow to drive from the UI.
 * The subscription assertions that used to live in section 1 belong with the
 * pricing page and should come back with it — the billing backend is still
 * there, just unwired.
 *
 *   npm run e2e
 *
 * Leaves the database as it found it (test user removed, settled pick reopened).
 */
import { createHash, randomBytes } from "node:crypto";
import postgres from "postgres";
import { chromium } from "playwright";
// Same rule as scripts/verify.mjs: how much a viewer should see is asked of
// the app's gate, never restated here, so a product change to the tiers can
// not leave a stale number behind. Run under tsx — see package.json.
import { visibleRankLimit } from "../src/lib/gating.ts";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const sql = postgres(process.env.DATABASE_URL, { max: 1 });

/** What a signed-out / unsubscribed visitor is entitled to on today's board. */
const [{ date: latestRaw }] = await sql`select max(date) as date from slates`;
// max() on a date column can come back as a Date; compare as YYYY-MM-DD so the
// driver never re-interprets it in another timezone.
const latestSlate =
  latestRaw instanceof Date ? latestRaw.toISOString().slice(0, 10) : latestRaw;
const [{ n: slateSize }] = await sql`
  select count(*)::int as n from picks where slate_date = ${latestSlate}
`;
const freeBoard = Math.min(visibleRankLimit(null), slateSize);

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

/* -------------------------------------------------- 1. signup -> the board */

console.log("\nSignup and the free board");

const testEmail = `e2e-${Date.now()}@example.com`;
{
  // Signup is capped at 3 accounts per IP per day (FR-A9). Every run of this
  // script burns one, so without this the suite bricks itself on the 4th run.
  await sql`delete from rate_limits where bucket = 'signup'`;

  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  await page.goto(`${APP_URL}/signup`);
  await hydrated(page);
  await page.fill("#email", testEmail);
  await page.fill("#password", "correct-horse-battery");
  await page.fill("#confirm", "correct-horse-battery");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/picks**", { timeout: 15000 });

  check(page.url().includes("/picks"), "signup redirects to the board");

  const [created] = await sql`select id, role from users where email = ${testEmail}`;
  check(Boolean(created), "user row created");
  check(created?.role === "user", "new users are not admins", `role=${created?.role}`);

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

  const [subs] = await sql`
    select count(*)::int as n from subscriptions where user_id = ${created.id}
  `;
  check(subs.n === 0, "no subscription is created during beta", `subscriptions=${subs.n}`);

  await ctx.close();
}

/* --------------------------------------------------------- 2. settle flow */

console.log("\nSettling a pick");

{
  // Pick something in the future so it appears in the "not started yet" list.
  const [target] = await sql`
    select p.id, p.rank, p.selection, p.price, p.slate_date
    from picks p where p.status = 'pending'
    order by p.starts_at asc limit 1
  `;

  if (!target) {
    check(false, "found a pending pick to settle");
  } else {
    const ctx = await browser.newContext();
    await ctx.addCookies([await sessionCookie("admin@oobeebets.com")]);
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
      audit?.actor_email === "admin@oobeebets.com",
      "audit log names the actor",
      audit?.actor_email,
    );

    // The public record must reflect it without any further action.
    const pub = await ctx.newPage();
    await pub.goto(`${APP_URL}/track-record`);
    const trHtml = await pub.content();
    check(
      trHtml.includes(target.selection),
      "settled pick appears on the public track record",
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
  await ctx.addCookies([await sessionCookie("elite@example.com")]);
  const page = await ctx.newPage();

  // A subscriber cannot even load the settle page.
  const res = await page.goto(`${APP_URL}/admin/settle`);
  check(res.status() === 404, "subscriber cannot open the settle page", `${res.status()}`);

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

  await page.goto(`${APP_URL}/signup`);
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

/* ------------------------------------------------------------- teardown */

// The test user's own session cascades with the row; only the ones minted
// above need clearing. A blanket delete here would sign out real sessions.
await sql`delete from users where email = ${testEmail}`;
await sql`delete from sessions where token_hash = any(${mintedSessions})`;
await sql`delete from rate_limits where bucket = 'signup'`;
await browser.close();

console.log(failures === 0 ? "\n✓ All flow tests passed.\n" : `\n✗ ${failures} failed.\n`);
await sql.end();
process.exit(failures === 0 ? 0 : 1);
