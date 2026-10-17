/**
 * Browser-driven flow tests for the paths that mutate the public record.
 * These exercise real server actions, not just rendering.
 *
 * There are no paid plans or billing backend — the whole tier/subscription
 * system was removed. Every account gets the same free board.
 *
 * "I took this bet" is in here rather than only in verify.mjs because the
 * check circle is the one control on the board a tester actually presses, and
 * an optimistic toggle that never reaches the server looks identical to one
 * that does until you go and read the row.
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
import { combineOdds } from "../src/lib/settlement.ts";
import { addDays } from "../src/lib/slate-date.ts";
import bcrypt from "bcryptjs";
import sharp from "sharp";
import {
  STATS_PLAYERS,
  STATS_SEASON,
  createSlate,
  dropSlate,
  dropStatsFixture,
  ensureTester,
  dropTester,
  seedStatsFixture,
  slateDateString,
} from "./fixtures.mjs";

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

/**
 * Pages with a loading.tsx stream a skeleton first; the page itself arrives
 * a moment after the load event. Checks that read a page — above all ones
 * that expect something to be absent — wait for it.
 */
async function loaded(page) {
  await page.waitForFunction(
    () => ![...document.querySelectorAll('[role="status"] .sr-only')].some((e) => e.textContent === "Loading…"),
    null,
    { timeout: 15_000 },
  );
}

const browser = await chromium.launch();

/* ---------------------------------------------- 1. invite -> onboarding -> board */

/**
 * The beta application's answer cards: a visually hidden input named
 * q-<question> inside each card. Clicked as a person would — on the card —
 * then waited on until the input reads checked.
 */
async function pickAnswer(page, field, value) {
  const input = page.locator(`input[name="q-${field}"][value="${value}"]`);
  if (await input.isChecked()) return;
  await page.locator("label").filter({ has: input }).click();
  for (let i = 0; i < 40 && !(await input.isChecked().catch(() => true)); i++) await page.waitForTimeout(50);
}

/** "How you bet", answered as a regular bettor. */
async function answerBetting(page) {
  await pickAnswer(page, "betFrequency", "A few times per week");
  await pickAnswer(page, "experience", "Intermediate");
  await pickAnswer(page, "sports", "NFL");
  await pickAnswer(page, "sportsbooks", "FanDuel");
  await pickAnswer(page, "betSize", "$10–$25");
  await pickAnswer(page, "decisionTools", "Stats");
}

/** "The beta": what they want, and what they'll give. */
async function answerBeta(page) {
  await page.locator('textarea[name="q-wants"]').fill("Honest records.");
  await pickAnswer(page, "willGiveFeedback", "yes");
  await page.locator('input[name="q-willDoSurvey"]').check();
}

console.log("\nInvite onboarding and the free board");

const testEmail = `e2e-${Date.now()}@example.com`;
{
  // The token is minted the same way the app does: a random base64url token,
  // only its sha256 hash stored — see lib/auth.ts hashToken.
  const inviteToken = randomBytes(32).toString("base64url");
  const inviteTokenHash = createHash("sha256").update(inviteToken).digest("hex");
  await sql`insert into invitations (email, token_hash, status, expires_at)
            values (${testEmail}, ${inviteTokenHash}, 'pending', ${new Date(Date.now() + 3600_000)})`;
  // They'd joined the waitlist first; making the account takes them off it.
  await sql`insert into waitlist (email, leave_token, source) values (${testEmail}, ${randomBytes(24).toString("base64url")}, 'landing')`;

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
  // An admin invite skips /signup, so the application is asked here: the
  // private full name beside the public display name, then two steps.
  await page.fill("#survey-fullName", "Taylor Tester Sr");
  await page.click('button:has-text("Continue")');

  // Step 4 — how you bet. Continue checks the answers before moving on.
  await page.click('button:has-text("Continue")');
  check(
    (await page.getByRole("heading", { name: "How you bet" }).isVisible()) &&
      (await page.getByText("Pick how often you bet").isVisible()),
    "Continue is refused until the betting questions are answered",
  );
  await answerBetting(page);
  await page.click('button:has-text("Continue")');

  // Step 5 — the beta questions, the 21+ / Terms box, then the real submit.
  await answerBeta(page);
  await page.click('button:has-text("Finish")');
  await page.waitForTimeout(500);
  check(
    page.url().includes("/invite/") && (await page.getByText("Confirm you're 21 or older").isVisible()),
    "Finish is refused until the 21+ / Terms box is ticked",
  );
  await page.check('input[name="agreeChoice"]');
  await page.click('button:has-text("Finish")');
  await page.waitForURL("**/home**", { timeout: 15000 });

  check(page.url().includes("/home"), "onboarding lands on Home");
  const [accepted] = await sql`select terms_accepted_at from users where email = ${testEmail}`;
  check(Boolean(accepted?.terms_accepted_at), "the account records when the Terms were accepted");
  const [{ waiting }] = await sql`select count(*)::int as waiting from waitlist where email = ${testEmail}`;
  check(waiting === 0, "making the account takes the address off the waitlist");
  const [answers] = await sql`select full_name, is_21, sportsbooks, bet_size, source from signup_surveys where email = ${testEmail}`;
  check(
    answers?.full_name === "Taylor Tester Sr" &&
      answers.is_21 &&
      answers.sportsbooks.join() === "FanDuel" &&
      answers.bet_size === "$10–$25" &&
      answers.source === "invite",
    "the invite wizard keeps the application answers",
    JSON.stringify(answers),
  );
  // Waited for, not read straight off the page: Home has a loading skeleton,
  // and the client-side redirect after Finish lands while it is still showing.
  check(
    await page
      .getByText("Account created")
      .first()
      .waitFor({ timeout: 15000 })
      .then(() => true, () => false),
    "Home greets a new account",
  );

  const [created] = await sql`
    select id, role, phone, display_name, monthly_spend_band
    from users where email = ${testEmail}
  `;
  check(Boolean(created), "user row created");
  check(created?.role === "user", "new users are not admins", `role=${created?.role}`);
  check(created?.phone === "+16502530000", "phone stored as E.164", `phone=${created?.phone}`);
  check(created?.display_name === "Taylor Tester", "display name stored", `name=${created?.display_name}`);

  const [invite] = await sql`select status, accepted_user_id from invitations where email = ${testEmail}`;
  check(invite?.status === "accepted", "invitation marked accepted", `status=${invite?.status}`);
  check(invite?.accepted_user_id === created?.id, "invitation links to the new user");

  // A brand-new account gets the whole free board immediately — no plan step.
  await page.goto(`${APP_URL}/picks`);
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

/* ------------------------------------- 1a. phone and spend are optional */

console.log("\nOnboarding without phone or spend");

const quietEmail = `e2e-quiet-${Date.now()}@example.com`;
{
  const inviteToken = randomBytes(32).toString("base64url");
  const inviteTokenHash = createHash("sha256").update(inviteToken).digest("hex");
  await sql`insert into invitations (email, token_hash, status, expires_at)
            values (${quietEmail}, ${inviteTokenHash}, 'pending', ${new Date(Date.now() + 3600_000)})`;
  // Answered on /signup already, so the wizard doesn't ask again.
  await sql`insert into signup_surveys (email, full_name, is_21, bet_frequency, experience, sports, wants, will_give_feedback, will_do_survey, source)
            values (${quietEmail}, 'Quiet Tester', true, 'Never', 'Beginner', ${["NFL"]}, 'x', true, true, 'signup')`;

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${APP_URL}/invite/${inviteToken}`);
  await hydrated(page);
  await page.click('button:has-text("Continue")');
  await page.fill("#password", "correct-horse-battery");
  await page.fill("#confirm", "correct-horse-battery");
  await page.click('button:has-text("Continue")');
  // A display name, and the phone left empty.
  await page.fill("#name", "Quiet Tester");
  check((await page.locator("#survey-fullName").count()) === 0, "someone who answered on /signup isn't asked again");
  await page.click('button:has-text("Continue")');
  check(
    (await page.getByText("Step 4 of 4").isVisible()) && (await page.getByText("I'm 21 or older and allowed").isVisible()),
    "an empty phone doesn't stop step 3, and the last step follows",
  );
  await page.check('input[name="agreeChoice"]');
  await page.click('button:has-text("Finish")');
  await page.waitForURL("**/home**", { timeout: 15000 }).catch(() => {});
  check(page.url().includes("/home"), "onboarding without phone or spend lands on Home", page.url());

  const [quiet] = await sql`select phone, monthly_spend_band, display_name from users where email = ${quietEmail}`;
  check(
    quiet?.phone === null && quiet?.monthly_spend_band === null,
    "no phone and no spend band are stored as empty",
    `phone=${quiet?.phone} band=${quiet?.monthly_spend_band}`,
  );
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

/* --------------------------------------------------------- 2. settle flow */

console.log("\nSettling a pick");

{
  // Pick something in the future so it appears in the "not started yet" list.
  const [target] = await sql`
    select p.id, p.rank, p.category, p.selection, p.price, p.slate_date, p.starts_at
    from picks p where p.status = 'pending'
    order by p.starts_at asc limit 1
  `;

  if (!target) {
    check(false, "found a pending pick to settle");
  } else {
    const ctx = await browser.newContext();
    await ctx.addCookies([await sessionCookie(ADMIN_EMAIL)]);
    const page = await ctx.newPage();

    // Before kick-off only a void can be recorded: "Not started" offers no
    // result buttons, and the action refuses one anyway.
    const startsAt = target.starts_at;
    if (new Date(startsAt) > new Date()) {
      await page.goto(`${APP_URL}/admin/settle?tab=upcoming`);
      await loaded(page);
      const row = page.locator(`[data-pick-id="${target.id}"]`);
      await row.waitFor({ timeout: 15000 });
      check(
        (await row.getByRole("button", { name: "Won", exact: true }).count()) === 0 &&
          (await row.getByText("Results open at kick-off").count()) === 1,
        "a pick that hasn't started can't be given a result",
      );
    }
    // Then it kicks off, and lands under "Needs a result".
    await sql`update picks set starts_at = now() - interval '1 hour' where id = ${target.id}`;
    await page.goto(`${APP_URL}/admin/settle`);
    await loaded(page);
    await hydrated(page, `[data-pick-id="${target.id}"] button`);
    // Won asks first; nothing is recorded until it's confirmed.
    await page.locator(`[data-pick-id="${target.id}"]`).getByRole("button", { name: "Won", exact: true }).click();
    const confirm = page.getByRole("dialog");
    await confirm.locator("#settle-score").fill("4-2");
    const [unconfirmed] = await sql`select status from picks where id = ${target.id}`;
    check(unconfirmed.status === "pending", "a result asks before it's recorded", `status=${unconfirmed.status}`);
    await confirm.getByRole("button", { name: "Settle as Won" }).click();
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
    await page.goto(`${APP_URL}/admin/activity?type=results`);
    await loaded(page);
    check(
      (await page.locator('li[data-activity="pick.settled.won"]', { hasText: `Settled ${target.selection} as Won` }).count()) >= 1,
      "the activity log reads it back as a sentence",
    );
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

    // Reopening asks first, then really puts it back to pending (it used to
    // close the dialog before its form posted, and nothing happened).
    await page.goto(`${APP_URL}/admin/settle?tab=settled`);
    await loaded(page);
    await hydrated(page, `[data-pick-id="${target.id}"] button`);
    await page.locator(`[data-pick-id="${target.id}"]`).getByRole("button", { name: "Reopen" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Reopen" }).click();
    let reopened;
    for (let i = 0; i < 20 && reopened?.status !== "pending"; i++) {
      await page.waitForTimeout(250);
      [reopened] = await sql`select status, final_score from picks where id = ${target.id}`;
    }
    check(reopened?.status === "pending" && reopened.final_score === null, "Reopen puts a settled pick back to pending", `status=${reopened?.status}`);
    const [reopenAudit] = await sql`
      select action from audit_log where entity_id = ${target.id} order by created_at desc limit 1
    `;
    check(reopenAudit?.action === "pick.unsettled", "and the reopen is logged", `action=${reopenAudit?.action}`);

    // Restore.
    await sql`update picks set status='pending', final_score=null, settled_at=null,
              settled_by=null, starts_at = ${startsAt} where id = ${target.id}`;
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

/* ------------------------------------------------ 3b. "I took this bet" */

console.log("\nFollowing a pick");

{
  const ctx = await browser.newContext();
  await ctx.addCookies([await sessionCookie(TESTER_EMAIL)]);
  const page = await ctx.newPage();

  const [tester] = await sql`select id from users where email = ${TESTER_EMAIL}`;

  // Only picks still ahead of kick-off carry a pressable circle; the settled
  // half of the fixture renders the same mark as a read-only statement. Asked
  // of the database at this moment rather than hardcoded, because section 2
  // settles and restores a pick above.
  const [{ n: takeable }] = await sql`
    select count(*)::int as n from picks
    where slate_date = ${latestSlate} and category = 'game'
      and status = 'pending' and starts_at > now() and rank <= ${freeBoard}
  `;

  await page.goto(`${APP_URL}/picks`);
  await hydrated(page, 'button[role="checkbox"]');

  const circles = page.locator('button[role="checkbox"]');
  check(
    (await circles.count()) === takeable,
    "every takeable pick has a circle, and nothing else does",
    `buttons=${await circles.count()} takeable=${takeable}`,
  );

  // The tab counts today's game bets, and the day's heading says the same.
  const [{ n: gameBets }] = await sql`
    select count(*)::int as n from picks where slate_date = ${latestSlate} and category = 'game'
  `;
  const tabLabel = await page.locator('nav[aria-label="Board"] a[aria-current="page"]').getAttribute("aria-label");
  check(tabLabel === `Game bets, ${gameBets}`, "the board's tab counts today's game bets", `${tabLabel}`);
  const heading = await page.locator(`#day-${latestSlate}-heading`).innerText();
  check(heading.includes(`${gameBets} game bet`), "today's heading counts them too", heading);

  const first = circles.first();
  check(
    (await first.getAttribute("aria-checked")) === "false",
    "circles start empty",
    `aria-checked=${await first.getAttribute("aria-checked")}`,
  );

  await first.click();
  await page.waitForTimeout(2500);

  const followed = await sql`
    select p.id, p.rank, p.status, p.starts_at, f.created_at
    from pick_follows f join picks p on p.id = f.pick_id
    where f.user_id = ${tester.id}
  `;
  check(followed.length === 1, "clicking the circle writes one row", `rows=${followed.length}`);
  check(followed[0]?.status === "pending", "the followed pick was still open", `status=${followed[0]?.status}`);
  check(
    followed[0] && followed[0].created_at < followed[0].starts_at,
    "the follow is recorded before kick-off, not after",
  );
  check(
    (await first.getAttribute("aria-checked")) === "true",
    "the circle reads as checked",
    `aria-checked=${await first.getAttribute("aria-checked")}`,
  );

  // Server truth, not just optimistic state: a fresh navigation re-renders the
  // card from the row that was written.
  await page.reload();
  await hydrated(page, 'button[role="checkbox"]');
  const reloaded = page.locator('button[role="checkbox"][aria-checked="true"]');
  check(
    (await reloaded.count()) === 1,
    "the tick survives a reload",
    `checked=${await reloaded.count()}`,
  );

  // Unchecking before kick-off deletes the row — absence is the "no".
  await reloaded.first().click();
  await page.waitForTimeout(2500);
  const [{ n: afterUncheck }] = await sql`
    select count(*)::int as n from pick_follows where user_id = ${tester.id}
  `;
  check(afterUncheck === 0, "unchecking removes the row", `rows=${afterUncheck}`);

  await ctx.close();
}

/* --------------------------------------------- 3c. building a parlay */

console.log("\nBuilding a parlay, and grading it from its legs");

{
  const ctx = await browser.newContext();
  await ctx.addCookies([await sessionCookie(TESTER_EMAIL)]);
  const page = await ctx.newPage();
  const [tester] = await sql`select id from users where email = ${TESTER_EMAIL}`;

  // Testers now build parlays from the odds feed on the Community tab, which
  // needs a live provider this script does not have. What this section
  // guards is the grading — a parlay graded from its legs, never stored — so
  // the ticket is written directly from two of the board's picks, the shape
  // every pre-feed tester parlay still has.
  const two = await sql`
    select id, slate_date from picks
    where slate_date = (select max(slate_date) from picks where status = 'pending')
      and status = 'pending'
    order by category, rank limit 2
  `;
  check(two.length === 2, "two pending picks to build from", `picks=${two.length}`);
  const [created] = await sql`
    insert into parlays (owner_id, slate_date) values (${tester.id}, ${two[0].slate_date}) returning id
  `;
  await sql`insert into parlay_legs (parlay_id, pick_id) values
    (${created.id}, ${two[0].id}), (${created.id}, ${two[1].id})`;

  const built = await sql`
    select p.id, count(l.pick_id)::int as legs
    from parlays p join parlay_legs l on l.parlay_id = p.id
    where p.owner_id = ${tester.id} group by p.id
  `;
  check(built.length === 1 && built[0].legs === 2, "a two-leg parlay is written", `parlays=${built.length} legs=${built[0]?.legs}`);

  // The Community tab is on the board, and a parlay nobody shared is not on it.
  await page.goto(`${APP_URL}/community`);
  check((await page.content()).includes("Community"), "the Community page renders");
  const [{ shared }] = await sql`select shared from parlays where id = ${created.id}`;
  check(shared === false, "a parlay is private unless its builder shares it");

  const parlayId = built[0]?.id;
  const [ranked] = await sql`select rank, price from parlays where id = ${parlayId}`;
  check(ranked?.rank === null, "a tester's parlay is unranked -- never on Oobee's board");
  check(ranked?.price === null, "no price is stored; it comes off the legs");

  // The legs, and what the maths says they are worth together.
  const legs = await sql`
    select pk.id, pk.price from parlay_legs l
    join picks pk on pk.id = l.pick_id where l.parlay_id = ${parlayId}
  `;
  const expected = combineOdds(legs.map((l) => l.price));

  await page.goto(`${APP_URL}/stats?tab=parlays`);
  let html = await page.content();
  check(html.includes("You built this"), "the parlay shows on the tester's Stats");
  const sign = expected > 0 ? `+${expected}` : `${expected}`;
  check(html.includes(sign), "the dashboard quotes the combined price", sign);
  // Ungraded tickets read Upcoming before the first leg starts and Live after.
  check(html.includes("Upcoming") || html.includes("Live"), "it starts life ungraded (Upcoming / Live)");

  // THE point of deriving rather than storing: settle one leg and the ticket
  // re-grades itself, with nothing having touched the parlay row.
  const [{ updated_at: before }] = await sql`select updated_at from parlays where id = ${parlayId}`;
  await sql`update picks set status = 'lost', settled_at = now() where id = ${legs[0].id}`;

  await page.goto(`${APP_URL}/stats?tab=parlays`);
  html = await page.content();
  check(html.includes("Lost"), "settling one leg lost grades the whole parlay lost");

  const [{ updated_at: after }] = await sql`select updated_at from parlays where id = ${parlayId}`;
  check(
    before.getTime() === after.getTime(),
    "the parlay row was never written to -- the grade is derived",
  );

  // Put it back and win both legs instead.
  await sql`update picks set status = 'won' where id = any(${legs.map((l) => l.id)})`;
  await page.goto(`${APP_URL}/stats?tab=parlays`);
  html = await page.content();
  check(html.includes("Won"), "winning every leg grades the parlay won");

  // A ticket whose legs have been graded is locked -- no deleting a loser.
  const [{ n: stillThere }] = await sql`select count(*)::int as n from parlays where id = ${parlayId}`;
  check(stillThere === 1, "the settled parlay is still on the record");

  await sql`update picks set status = 'pending', settled_at = null where id = any(${legs.map((l) => l.id)})`;
  await sql`delete from parlays where id = ${parlayId}`;
  await ctx.close();
}

/* ------------------------------------------- 3d. admin sees what testers built */

console.log("\nAdmin inspection");

{
  const ctx = await browser.newContext();
  await ctx.addCookies([await sessionCookie(ADMIN_EMAIL)]);
  const page = await ctx.newPage();
  const [tester] = await sql`select id from users where email = ${TESTER_EMAIL}`;

  const legs = await sql`
    select id from picks where slate_date = ${latestSlate}
      and status = 'pending' and starts_at > now() order by rank limit 2
  `;
  const [p] = await sql`
    insert into parlays (owner_id, slate_date) values (${tester.id}, ${latestSlate}) returning id
  `;
  await sql`insert into parlay_legs (parlay_id, pick_id)
            select ${p.id}, id from picks where id = any(${legs.map((l) => l.id)})`;

  const res = await page.goto(`${APP_URL}/admin/parlays`);
  check(res.status() === 200, "admin opens the parlay inspector", `${res.status()}`);
  const html = await page.content();
  check(html.includes(TESTER_EMAIL), "the tester's parlay is listed with its owner");
  check(html.includes("Built by testers"), "tester-built parlays have their own section");

  await sql`delete from parlays where id = ${p.id}`;
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
  await sql`insert into users (email, password_hash, role, username)
            values (${secondAdmin}, ${"x"}, 'admin', 't_' || substr(md5(random()::text), 1, 12))`;

  const ctx = await browser.newContext();
  await ctx.addCookies([await sessionCookie(secondAdmin)]);
  const page = await ctx.newPage();

  const [someone] = await sql`select id from users where email = ${TESTER_EMAIL}`;
  for (const route of [
    "/admin",
    "/admin/activity",
    "/admin/users",
    "/admin/users?tab=invites",
    `/admin/users/${someone.id}`,
    `/admin/users/${someone.id}?tab=bets`,
    `/admin/users/${someone.id}?tab=parlays`,
    `/admin/users/${someone.id}?tab=activity`,
    "/admin/follows",
    "/admin/follows?tab=breakdown",
    "/admin/follows?tab=day",
    "/admin/follows?tab=testers",
    `/admin/follows/${someone.id}`,
    "/admin/parlays",
    "/admin/slate",
    "/admin/slate?category=parlay",
    "/admin/settle",
    "/admin/settle?tab=community",
    "/admin/settle?tab=upcoming",
    "/admin/settle?tab=settled",
    "/admin/waitlist",
    "/admin/announce",
    "/admin/feedback",
    "/admin/reports",
  ]) {
    const res = await page.goto(`${APP_URL}${route}`);
    // The console streams a skeleton first (admin/loading.tsx), so the status
    // is sent before the page has run: a page that throws still says 200.
    // Wait for it, then look for the error screen as well.
    await loaded(page);
    const broke = await page.getByRole("heading", { name: "Something broke" }).count();
    check(res.status() === 200 && broke === 0, `second admin opens ${route}`, `${res.status()}${broke ? " but it broke" : ""}`);
  }

  // Admin perf audit (2026-10-17): lists search and page in Postgres, and
  // Follows counts every tester rather than a capped list of them.
  const [t] = await sql`select id, username from users where email = ${TESTER_EMAIL}`;
  await page.goto(`${APP_URL}/admin/users?q=${encodeURIComponent(t.username)}`);
  await loaded(page);
  check(
    (await page.locator(`tr[data-user-id="${t.id}"]`).count()) === 1 &&
      (await page.locator("tr[data-user-id]").count()) === 1,
    "the users directory searches by handle",
  );
  // Past one page the pager's links are built on the server — this broke the
  // whole page at 5k accounts while every small-DB check stayed green.
  await sql`insert into users (email, password_hash, role, username)
            select 'e2e-page-' || g || '@example.com', 'x', 'user', 'e2e_page_' || g from generate_series(1, 55) g`;
  await page.goto(`${APP_URL}/admin/users`);
  await loaded(page);
  const nextLink = page.getByRole("navigation", { name: "Pages" }).getByRole("link", { name: "Next" });
  check(
    (await page.locator("tr[data-user-id]").count()) === 50 && (await nextLink.count()) === 1,
    "the users directory pages at 50",
  );
  await page.goto(`${APP_URL}/admin/users?page=2`);
  await loaded(page);
  check(
    (await page.locator("tr[data-user-id]").count()) > 0 &&
      (await page.getByRole("heading", { name: "Something broke" }).count()) === 0,
    "and its second page renders",
  );
  await sql`delete from users where email like 'e2e-page-%@example.com'`;
  await page.goto(`${APP_URL}/admin/users?q=no-such-account-anywhere`);
  await loaded(page);
  check((await page.getByText("No one matches that.").count()) === 1, "and says when nobody matches");
  const [{ n: testerTotal }] = await sql`select count(*)::int as n from users where role = 'user'`;
  await page.goto(`${APP_URL}/admin/follows`);
  await loaded(page);
  const shown = Number((await page.content()).match(/Testers<\/dt><dd[^>]*><span[^>]*>(\d+)/)?.[1]);
  check(shown === testerTotal, "Follows counts every tester", `shown=${shown} testers=${testerTotal}`);
  await page.goto(`${APP_URL}/admin/follows?tab=testers`);
  await loaded(page);
  check((await page.getByText(`of ${testerTotal} testers`).count()) === 1, "the tester table pages through all of them");

  // Signing in marks the account active for the day (user_active_days).
  const [seen] = await sql`select 1 from user_active_days where user_id = ${t.id}`;
  check(Boolean(seen), "a signed-in tester is recorded as active today");

  // Both admins are listed, and the promoted one is not a special case.
  const [{ n }] = await sql`select count(*)::int as n from users where role = 'admin'`;
  check(n === 2, "two admins coexist", `admins=${n}`);
  await ctx.close();
}

/* ------------------------------------------------------- 6. password reset */

console.log("\nPassword reset");
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  // Asking says the same thing for an address with no account.
  await page.goto(`${APP_URL}/forgot-password`);
  await hydrated(page);
  await page.fill("#email", `nobody-${Date.now()}@example.com`);
  await page.click('button:has-text("Send reset link")');
  await page.getByText("If an account uses that email").waitFor({ timeout: 10000 });
  check(true, "the forgot form answers without saying whether the account exists");

  // The emailed link, minted the way the action mints it (only the hash stored).
  const resetToken = randomBytes(32).toString("base64url");
  const resetHash = createHash("sha256").update(resetToken).digest("hex");
  const [u] = await sql`select id from users where email = ${testEmail}`;
  await sql`insert into password_resets (user_id, token_hash, expires_at)
            values (${u.id}, ${resetHash}, ${new Date(Date.now() + 3600_000)})`;
  const before = (await sql`select id from sessions where user_id = ${u.id}`).map((r) => r.id);

  await page.goto(`${APP_URL}/reset-password/${resetToken}`);
  await hydrated(page);
  await page.fill("#password", "a-brand-new-password");
  await page.fill("#confirm", "a-brand-new-password");
  await page.click('button:has-text("Set new password")');
  await page.waitForURL("**/home**", { timeout: 15000 });
  check(page.url().includes("/home"), "a reset signs you in and lands on Home");

  const after = (await sql`select id from sessions where user_id = ${u.id}`).map((r) => r.id);
  check(
    before.length >= 1 && after.length === 1 && !before.includes(after[0]),
    "every earlier session was signed out",
    `before=${before.length} after=${after.length}`,
  );
  const [{ left }] = await sql`select count(*)::int as left from password_resets where user_id = ${u.id}`;
  check(left === 0, "the link is spent");

  await page.goto(`${APP_URL}/reset-password/${resetToken}`);
  check((await page.content()).includes("This link has expired"), "a used link can't be used again");

  // And the new password is the one that works.
  await ctx.clearCookies();
  await page.goto(`${APP_URL}/login`);
  await hydrated(page);
  await page.fill("#email", testEmail);
  await page.fill("#password", "a-brand-new-password");
  await page.click('button:has-text("Sign in")');
  await page.waitForURL("**/home**", { timeout: 15000 });
  check(page.url().includes("/home"), "signs in with the new password");
  await ctx.close();
}

/* ------------------------------------------------------------- 7. players */

console.log("\nPlayers");

await seedStatsFixture(sql);
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addCookies([await sessionCookie(TESTER_EMAIL)]);
  const page = await ctx.newPage();
  const rows = page.locator('[role="table"] [role="row"].cursor-pointer');

  // The nav leads there.
  await page.goto(`${APP_URL}/home`);
  await page.getByRole("link", { name: "Players" }).first().click();
  await page.waitForURL(/\/players/);
  check(true, "sidebar links to Players");

  await page.goto(`${APP_URL}/players?sport=nfl&season=${STATS_SEASON}&all=1`);
  await hydrated(page, '[role="table"]');
  check((await rows.count()) === 50, "first page is fifty rows", `rows=${await rows.count()}`);
  // Regression guard: a chunk arriving used to swap the page for its loading
  // skeleton for a moment, and the browser dropped the reader at the top.
  await page.evaluate(() => {
    window.__jumpedToTop = false;
    let last = scrollY;
    addEventListener("scroll", () => {
      if (last > 300 && scrollY < 150) window.__jumpedToTop = true;
      last = scrollY;
    }, { passive: true });
  });
  await page.mouse.wheel(0, 20_000);
  await page.waitForFunction((n) => document.querySelectorAll('[role="table"] [role="row"].cursor-pointer').length === n, STATS_PLAYERS, { timeout: 15_000 }).catch(() => {});
  check((await rows.count()) === STATS_PLAYERS, "scrolling loads the rest", `rows=${await rows.count()}`);
  await page.waitForTimeout(500);
  check(!(await page.evaluate(() => window.__jumpedToTop)), "loading more keeps the scroll position");

  // Passing yards are sorted most-first; a click on the header flips it.
  await page.getByRole("link", { name: "Sort by Passing yards", exact: true }).click();
  await page.waitForURL(/dir=asc/);
  await page.waitForFunction(() => document.querySelector('[role="table"] [role="row"].cursor-pointer')?.textContent?.includes("Fixture Player 60"));
  check(true, "header click sorts ascending, fewest yards first");

  // The season picker offers the season, marked current.
  await page.getByRole("button", { name: /^Season:/ }).click();
  const option = page.getByRole("menuitem", { name: /\b1999\b/ });
  check((await option.getAttribute("aria-current")) === "true", "season picker marks the season shown");
  await page.keyboard.press("Escape");

  // A tap anywhere on a row opens the player.
  await rows.first().locator('[role="cell"]').last().click();
  await page.waitForURL(/\/players\/nfl\/fx-/);
  await page.getByText("By season").waitFor();
  check(true, "a row opens the player's page");
  await ctx.close();
}
{
  // On a phone, Players lives in the drawer; the bottom bar keeps its five.
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addCookies([await sessionCookie(TESTER_EMAIL)]);
  const page = await ctx.newPage();
  await page.goto(`${APP_URL}/players?sport=nfl&season=${STATS_SEASON}`);
  await hydrated(page, "button");
  check((await page.locator('nav.fixed a[href="/players"]').count()) === 0, "Players is not in the bottom bar");
  // Measured before the drawer opens (its slide-in pokes past the edge), and
  // given a moment: the page briefly measures 400 while it settles on CI.
  let width = 0;
  for (let i = 0; i < 15; i++) {
    width = await page.evaluate(() => document.documentElement.scrollWidth);
    if (width <= 390) break;
    await page.waitForTimeout(200);
  }
  check(width <= 390, "the table never scrolls the page sideways", `scrollWidth=${width}`);
  await page.getByRole("button", { name: "Open menu" }).click();
  const link = page.getByRole("dialog").getByRole("link", { name: "Players" });
  check(await link.isVisible(), "Players is in the phone drawer");
  await ctx.close();
}
await dropStatsFixture(sql);

/* ------------------------------------------------- a shared parlay post */

console.log("\nShared parlay in the feed");
{
  // Someone else's shared ticket is a post like any other: the ticket where a
  // photo would go, and Play in the same action row as Reply and Like.
  const legs = await sql`
    select id from picks where slate_date = ${latestSlate}
      and status = 'pending' and starts_at > now() order by rank limit 2
  `;
  const [pl] = await sql`
    insert into parlays (owner_id, slate_date, shared) values (${seedAdmin.id}, ${latestSlate}, true) returning id
  `;
  await sql`insert into parlay_legs (parlay_id, pick_id)
            select ${pl.id}, id from picks where id = any(${legs.map((l) => l.id)})`;
  const [post] = await sql`insert into posts (author_id, body, parlay_id) values (${seedAdmin.id}, '', ${pl.id}) returning id`;
  const [tester] = await sql`select id from users where email = ${TESTER_EMAIL}`;

  const ctx = await browser.newContext();
  await ctx.addCookies([await sessionCookie(TESTER_EMAIL)]);
  const page = await ctx.newPage();
  await page.goto(`${APP_URL}/p/${post.id}`);
  await hydrated(page, "article button");
  const article = page.locator("article", { has: page.locator('[role="group"][aria-label*="2-leg parlay"]') });
  check((await article.count()) === 1, "the ticket sits inside the post");
  const play = article.getByRole("checkbox", { name: /I played this parlay/ });
  const like = article.getByRole("button", { name: /^Like/ });
  const [playBox, likeBox] = [await play.boundingBox(), await like.boundingBox()];
  check(
    Boolean(playBox && likeBox) && Math.abs(playBox.y - likeBox.y) < 4,
    "Play is in the action row, beside Like",
    `play.y=${playBox?.y} like.y=${likeBox?.y}`,
  );
  await play.click();
  await page.waitForFunction(() => document.querySelector('[role="checkbox"]')?.getAttribute("aria-checked") === "true");
  let row;
  for (let i = 0; i < 20 && !row; i++) {
    [row] = await sql`select 1 from parlay_follows where user_id = ${tester.id} and parlay_id = ${pl.id}`;
    if (!row) await page.waitForTimeout(250);
  }
  check(Boolean(row), "pressing Play logs the parlay as played");
  await ctx.close();

  // The owner hears that it was played — never by whom: who played what is
  // private (the privacy policy promises totals only).
  const ownerCtx = await browser.newContext();
  await ownerCtx.addCookies([await sessionCookie(ADMIN_EMAIL)]);
  const ownerPage = await ownerCtx.newPage();
  await ownerPage.goto(`${APP_URL}/notifications`);
  const [{ username: testerHandle }] = await sql`select username from users where id = ${tester.id}`;
  const playRow = ownerPage.locator('[data-notification="play"]');
  check((await playRow.count()) === 1, "the parlay's owner is told it was played");
  check(
    !(await playRow.innerHTML()).includes(testerHandle) && (await playRow.innerText()).includes("Someone played your parlay"),
    "without naming who played it",
  );
  await ownerCtx.close();
  await sql`delete from posts where id = ${post.id}`;
  await sql`delete from parlays where id = ${pl.id}`;
}

/* ------------------------------------- NFL only, and the parlay builder */

console.log("\nNFL only, and the parlay builder");
{
  // One sport: a single NFL pill, no "All".
  const ctx = await browser.newContext();
  await ctx.addCookies([await sessionCookie(TESTER_EMAIL)]);
  const page = await ctx.newPage();
  await page.goto(`${APP_URL}/picks`);
  await loaded(page);
  const pills = page.locator('nav[aria-label="Sport"] a');
  check((await pills.count()) === 1 && (await pills.first().innerText()).includes("NFL"), "the sport pills are just NFL");

  // Three games in the next week, on two days, priced by one book.
  const at = (h) => new Date(Date.now() + h * 3600_000);
  const fixtureGames = [
    { id: "e2e-nfl-1", away: "Buffalo Bills", home: "Kansas City Chiefs", start: at(26) },
    { id: "e2e-nfl-2", away: "Dallas Cowboys", home: "Philadelphia Eagles", start: at(27) },
    { id: "e2e-nfl-3", away: "Seattle Seahawks", home: "San Francisco 49ers", start: at(98) },
  ];
  for (const g of fixtureGames) {
    await sql`insert into games (id, league, sport_key, home_team, away_team, commence_time)
              values (${g.id}, 'NFL', 'americanfootball_nfl', ${g.home}, ${g.away}, ${g.start})`;
    await sql`insert into lines (game_id, market_key, outcome, price, book, book_title) values
              (${g.id}, 'h2h', ${g.away}, 140, 'draftkings', 'DraftKings'),
              (${g.id}, 'h2h', ${g.home}, -160, 'draftkings', 'DraftKings')`;
  }

  await page.goto(`${APP_URL}/community/new`);
  await loaded(page);
  await hydrated(page, 'input[type="search"]');
  const cards = page.locator("article[aria-label$=' at Kansas City Chiefs'], article[aria-label$=' at Philadelphia Eagles'], article[aria-label$=' at San Francisco 49ers']");
  check((await cards.count()) === 3, "the builder offers games beyond today", `games=${await cards.count()}`);
  check((await page.locator('section[aria-label] > h3').count()) >= 2, "games are grouped by day");

  const search = page.locator('input[type="search"]');
  await search.fill("chiefs");
  check((await cards.count()) === 1, "search narrows to the team typed", `games=${await cards.count()}`);
  await search.fill("seattle 49ers");
  check((await cards.count()) === 1, "every word has to match", `games=${await cards.count()}`);
  await search.fill("zzz");
  check(await page.getByText("No games match").isVisible(), "no match says so");
  await page.getByRole("button", { name: "Clear search" }).click();
  check((await cards.count()) === 3, "clearing brings every game back");

  // A ticket across two days saves, filed under its first leg's day.
  await page.locator("article[aria-label='Buffalo Bills at Kansas City Chiefs'] button[aria-pressed]").first().click();
  await page.locator("article[aria-label='Seattle Seahawks at San Francisco 49ers'] button[aria-pressed]").first().click();
  await page.getByRole("button", { name: "Save parlay" }).click();
  const [tester] = await sql`select id from users where email = ${TESTER_EMAIL}`;
  let saved;
  for (let i = 0; i < 40 && !saved; i++) {
    [saved] = await sql`
      select p.id, p.slate_date::text as slate_date, count(l.*)::int as legs from parlays p
      join parlay_selection_legs l on l.parlay_id = p.id
      join selections s on s.id = l.selection_id
      where p.owner_id = ${tester.id} and s.game_id like 'e2e-nfl-%' group by p.id`;
    if (!saved) await page.waitForTimeout(250);
  }
  check(saved?.legs === 2, "a parlay can span two days", `legs=${saved?.legs}`);
  check(saved?.slate_date === slateDateString(fixtureGames[0].start), "it files under its first leg's day", `${saved?.slate_date}`);
  await ctx.close();

  // On a phone, the same search.
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await phone.addCookies([await sessionCookie(TESTER_EMAIL)]);
  const p2 = await phone.newPage();
  await p2.goto(`${APP_URL}/community/new`);
  await loaded(p2);
  await hydrated(p2, 'input[type="search"]');
  await p2.locator('input[type="search"]').fill("eagles");
  const phoneCards = p2.locator("article[aria-label$=' at Philadelphia Eagles']");
  check((await phoneCards.count()) === 1 && (await p2.locator("article[aria-label$=' at Kansas City Chiefs']").count()) === 0, "search works on a phone");
  const width = await p2.evaluate(() => document.documentElement.scrollWidth);
  check(width <= 390, "the builder never scrolls sideways on a phone", `scrollWidth=${width}`);
  await phone.close();

  if (saved) await sql`delete from parlays where id = ${saved.id}`;
  await sql`delete from selections where game_id like 'e2e-nfl-%'`;
  await sql`delete from games where id like 'e2e-nfl-%'`;
}

/* ------------------------------------------------------- game-day board */

console.log("\nGame-day board");
{
  // NFL plays on a few days a week. With no board out today and no game on
  // today's slate, Picks leads with the next game day and the admin builder
  // opens on it. Today's fixture slate goes back to a draft for this.
  const gameAt = new Date(Date.now() + 50 * 3600_000);
  const gameDay = slateDateString(gameAt);
  await sql`insert into games (id, league, sport_key, home_team, away_team, commence_time)
            values ('e2e-gameday-1', 'NFL', 'americanfootball_nfl', 'Detroit Lions', 'Green Bay Packers', ${gameAt})`;
  const [{ published_at: publishedAt }] = await sql`select published_at from slates where date = ${latestSlate}`;
  await sql`update slates set published_at = null where date = ${latestSlate}`;

  const ctx = await browser.newContext();
  await ctx.addCookies([await sessionCookie(TESTER_EMAIL)]);
  const page = await ctx.newPage();
  await page.goto(`${APP_URL}/picks`);
  await loaded(page);
  const lead = page.locator(`#day-${gameDay}`);
  check((await lead.count()) === 1, "with no games today, the board leads with the next game day", gameDay);
  check((await lead.innerText()).includes("No NFL games today"), "and says there are no games today");
  check((await page.locator(`#day-${latestSlate}`).count()) === 0, "today isn't listed as if picks were coming");

  // A game on today's slate makes today the lead again, with "nothing yet".
  const todayAt = new Date(Date.now() - 60_000);
  if (slateDateString(todayAt) === latestSlate) {
    await sql`insert into games (id, league, sport_key, home_team, away_team, commence_time)
              values ('e2e-gameday-0', 'NFL', 'americanfootball_nfl', 'Chicago Bears', 'Minnesota Vikings', ${todayAt})`;
    await page.goto(`${APP_URL}/picks`);
    await loaded(page);
    const today = page.locator(`#day-${latestSlate}`);
    check((await today.count()) === 1 && (await today.innerText()).includes("up yet"), "on a game day, today leads and says picks are coming");
    check((await page.locator(`#day-${gameDay}`).count()) === 0, "and the next game day waits its turn");
    await sql`delete from games where id = 'e2e-gameday-0'`;
  }
  await ctx.close();

  const adminCtx = await browser.newContext();
  await adminCtx.addCookies([await sessionCookie(ADMIN_EMAIL)]);
  const admin = await adminCtx.newPage();
  await admin.goto(`${APP_URL}/admin/slate`);
  await loaded(admin);
  const opened = await admin.locator('input[aria-label="Slate date"]').inputValue();
  check(opened === gameDay, "the slate builder opens on the next game day", opened);
  // The builder's date carries the tab, so a different day's link needs it too.
  const noGames = addDays(latestSlate, 1);
  await admin.goto(`${APP_URL}/admin/slate?date=${noGames}&category=game`);
  await loaded(admin);
  check(
    (await admin.getByText("No games left to pick on").count()) === 1 &&
      (await admin.locator("p", { hasText: "No games left to pick on" }).locator(`a[href="/admin/slate?date=${gameDay}&category=game"]`).count()) === 1,
    "a day without games links to the next game day",
  );
  check((await admin.locator('[aria-label="Slate completeness"]').count()) === 0, "a short slate isn't shown as incomplete");
  await admin.goto(`${APP_URL}/admin`);
  await loaded(admin);
  check((await admin.getByRole("heading", { name: /^Next slate/ }).count()) === 1, "the overview's slate card is the next game day's");
  check(
    (await admin.getByRole("heading", { name: "Needs your attention" }).count()) === 1 &&
      (await admin.locator('a[href^="/admin/slate?date="]', { hasText: "isn't published" }).count()) === 1,
    "the overview lists the unpublished game day as a to-do",
  );
  check((await admin.locator('nav[aria-label="Admin sections"] a').count()) >= 11, "the sidebar lists every admin section");
  await adminCtx.close();

  await sql`update slates set published_at = ${publishedAt} where date = ${latestSlate}`;
  await sql`delete from games where id = 'e2e-gameday-1'`;
}

/* ------------------------------------- waitlist, password, profile picture */

console.log("\nWaitlist, change password and profile pictures");
{
  // Sign-ups are closed in CI (SIGNUP_ENABLED unset): the landing form joins
  // the waitlist. The email itself fails without Resend; the row is what counts.
  const waitEmail = `e2e-wait-${Date.now()}@example.com`;
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  // The landing page now points at /signup instead of taking an address.
  await page.goto(`${APP_URL}/`);
  check((await page.locator('a[href="/signup"]', { hasText: "Join the waitlist" }).count()) >= 1, "the landing page links to the signup application");

  await page.goto(`${APP_URL}/signup`);
  await hydrated(page, 'input[name="q-is21"]');
  // Age comes first, and a no ends it before anything is typed.
  await pickAnswer(page, "is21", "no");
  const stopped = await page.getByText("only for people 21 and older").waitFor({ timeout: 5000 }).then(() => true, () => false);
  check(stopped && (await page.locator('input[name="q-email"]').count()) === 0, "a no on 21+ stops the application");
  await pickAnswer(page, "is21", "yes");
  // Submitting it empty is caught in the browser, at the first unanswered question.
  await page.getByRole("button", { name: "Join waitlist" }).click();
  check(await page.getByText("Enter your name").isVisible(), "an empty application is refused where it's wrong");
  await page.locator('input[name="q-fullName"]').fill("E2E Tester");
  await page.locator('input[name="q-email"]').fill(waitEmail);
  // Someone who never bets has no sportsbook, stake or method to tell us about.
  await pickAnswer(page, "betFrequency", "Never");
  check((await page.locator('input[name="q-sportsbooks"]').count()) === 0, "someone who never bets isn't asked for a sportsbook");
  await answerBetting(page);
  // "Nothing" rules out every other method, and the other way round.
  await pickAnswer(page, "decisionTools", "Nothing");
  check(!(await page.locator('input[name="q-decisionTools"][value="Stats"]').isChecked()), '"Nothing" unticks the other methods');
  await pickAnswer(page, "decisionTools", "Stats");
  check(!(await page.locator('input[name="q-decisionTools"][value="Nothing"]').isChecked()), 'a method unticks "Nothing"');
  await pickAnswer(page, "sports", "Other");
  await page.locator('input[name="q-sportsOther"]').fill("Darts");
  await answerBeta(page);
  await page.getByRole("button", { name: "Join waitlist" }).click();
  await page.getByText("You're on the list").waitFor({ timeout: 10000 });
  let row;
  for (let i = 0; i < 40 && !row; i++) {
    [row] = await sql`select leave_token, source from waitlist where email = ${waitEmail}`;
    if (!row) await page.waitForTimeout(250);
  }
  check(row?.source === "signup", "the signup application puts you on the waitlist", `${row?.source}`);
  const [survey] = await sql`
    select full_name, sports, sports_other, sportsbooks, bet_size, decision_tools, will_do_survey
    from signup_surveys where email = ${waitEmail}`;
  check(
    survey?.full_name === "E2E Tester" &&
      survey.sports.join() === "NFL,Other" &&
      survey.sports_other === "Darts" &&
      survey.sportsbooks.join() === "FanDuel" &&
      survey.bet_size === "$10–$25" &&
      survey.decision_tools.join() === "Stats" &&
      survey.will_do_survey,
    "the answers are kept",
    JSON.stringify(survey),
  );

  // An address that already has an account gets the very same reply, and no row.
  await page.goto(`${APP_URL}/signup`);
  await hydrated(page, 'input[name="q-is21"]');
  await pickAnswer(page, "is21", "yes");
  await page.locator('input[name="q-fullName"]').fill("E2E Tester");
  await page.locator('input[name="q-email"]').fill(testEmail);
  await answerBetting(page);
  await answerBeta(page);
  await page.getByRole("button", { name: "Join waitlist" }).click();
  await page.getByText("You're on the list").waitFor({ timeout: 10000 });
  await page.waitForTimeout(500);
  const [{ n: accountRows }] = await sql`select count(*)::int as n from waitlist where email = ${testEmail}`;
  check(accountRows === 0, "an existing account isn't put on it, and the reply doesn't say so");

  await page.goto(`${APP_URL}/login`);
  check((await page.getByRole("link", { name: "Join the waitlist" }).count()) === 1, "sign-in points to the waitlist while sign-ups are closed");

  // Admins see who's waiting.
  const adminCtx = await browser.newContext();
  await adminCtx.addCookies([await sessionCookie(ADMIN_EMAIL)]);
  const admin = await adminCtx.newPage();
  await admin.goto(`${APP_URL}/admin/waitlist`);
  await loaded(admin);
  check((await admin.locator("li[data-waitlist-id]", { hasText: waitEmail }).count()) === 1, "the admin waitlist lists them");
  await admin.goto(`${APP_URL}/admin/waitlist?q=${encodeURIComponent(waitEmail)}`);
  await loaded(admin);
  check(
    (await admin.locator("li[data-waitlist-id]").count()) === 1 &&
      (await admin.locator("li[data-waitlist-id]", { hasText: waitEmail }).count()) === 1,
    "the waitlist searches by email",
  );
  await adminCtx.close();

  // The leave link asks first: opening it changes nothing.
  await page.goto(`${APP_URL}/waitlist/leave?token=${encodeURIComponent(row.leave_token)}`);
  await hydrated(page);
  const [{ n: still }] = await sql`select count(*)::int as n from waitlist where email = ${waitEmail}`;
  check(still === 1, "opening the leave link doesn't act on its own");
  await page.getByRole("button", { name: "Yes, take me off the waitlist" }).click();
  await page.getByText("You're off the waitlist").waitFor({ timeout: 10000 });
  const [{ n: gone }] = await sql`select count(*)::int as n from waitlist where email = ${waitEmail}`;
  const [{ n: answersGone }] = await sql`select count(*)::int as n from signup_surveys where email = ${waitEmail}`;
  check(answersGone === 0, "leaving the waitlist forgets the answers too");
  check(gone === 0, "leaving deletes the address");

  // A mailbox's one-click unsubscribe (RFC 8058) is a bare POST.
  const oneClick = randomBytes(24).toString("base64url");
  await sql`insert into waitlist (email, leave_token, source) values (${`e2e-oneclick-${Date.now()}@example.com`}, ${oneClick}, 'signup')`;
  const res = await page.request.post(`${APP_URL}/api/waitlist/leave?token=${oneClick}`);
  const [{ n: oneClickLeft }] = await sql`select count(*)::int as n from waitlist where leave_token = ${oneClick}`;
  check(res.status() === 204 && oneClickLeft === 0, "one-click unsubscribe takes them off", `${res.status()}`);
  await ctx.close();
}
{
  // Change password, signed in: needs the current one, keeps this device,
  // signs out every other. The account's password is the one section 6 set.
  const [u] = await sql`select id from users where email = ${testEmail}`;
  const ctx = await browser.newContext();
  await ctx.addCookies([await sessionCookie(testEmail)]);
  const elsewhere = await sessionCookie(testEmail);
  const page = await ctx.newPage();
  await page.goto(`${APP_URL}/account`);
  await hydrated(page, "#current-password");
  await page.fill("#current-password", "not-my-password");
  await page.fill("#new-password", "changed-on-the-account-page");
  await page.fill("#confirm-password", "changed-on-the-account-page");
  await page.getByRole("button", { name: "Change password" }).click();
  await page.getByText("That isn't your current password").waitFor({ timeout: 10000 });
  check(true, "a wrong current password is refused");

  await page.fill("#current-password", "a-brand-new-password");
  await page.fill("#new-password", "changed-on-the-account-page");
  await page.fill("#confirm-password", "changed-on-the-account-page");
  await page.getByRole("button", { name: "Change password" }).click();
  await page.getByText("Password changed").waitFor({ timeout: 10000 });
  const [{ password_hash: hash }] = await sql`select password_hash from users where id = ${u.id}`;
  check(await bcrypt.compare("changed-on-the-account-page", hash), "the new password is the one stored");
  const elsewhereHash = createHash("sha256").update(elsewhere.value).digest("hex");
  const [{ n: otherLeft }] = await sql`select count(*)::int as n from sessions where token_hash = ${elsewhereHash}`;
  const [{ n: mine }] = await sql`select count(*)::int as n from sessions where user_id = ${u.id}`;
  check(otherLeft === 0 && mine === 1, "every other device is signed out, this one stays", `other=${otherLeft} mine=${mine}`);
  await ctx.close();
}
{
  // A profile picture: shrunk in the browser, cropped and re-encoded on the
  // server, served small, and shown wherever the person is.
  const [tester] = await sql`select id from users where email = ${TESTER_EMAIL}`;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addCookies([await sessionCookie(TESTER_EMAIL)]);
  const page = await ctx.newPage();
  await page.goto(`${APP_URL}/account`);
  await hydrated(page, 'input[aria-label="Profile picture"]');
  const photo = await sharp({ create: { width: 1800, height: 1200, channels: 3, background: { r: 30, g: 140, b: 220 } } })
    .jpeg()
    .toBuffer();
  await page.locator('input[aria-label="Profile picture"]').setInputFiles({ name: "me.jpg", mimeType: "image/jpeg", buffer: photo });
  let avatarId = null;
  for (let i = 0; i < 60 && !avatarId; i++) {
    [{ avatar_id: avatarId }] = await sql`select avatar_id from users where id = ${tester.id}`;
    if (!avatarId) await page.waitForTimeout(250);
  }
  check(Boolean(avatarId), "uploading a photo sets the profile picture");

  const small = await page.request.get(`${APP_URL}/api/avatars/${avatarId}/small`);
  const large = await page.request.get(`${APP_URL}/api/avatars/${avatarId}/large`);
  const smallMeta = await sharp(await small.body()).metadata();
  const largeMeta = await sharp(await large.body()).metadata();
  check(
    small.headers()["content-type"] === "image/webp" && smallMeta.width === 96 && smallMeta.height === 96 && largeMeta.width === 320,
    "it's stored as square WebP in two sizes",
    `${smallMeta.width}x${smallMeta.height}, ${largeMeta.width}x${largeMeta.height}`,
  );
  check((await small.body()).length < 10_000, "the small one is a few KB", `${(await small.body()).length} bytes`);
  check((small.headers()["cache-control"] ?? "").includes("immutable"), "each picture is cached for good");

  await page.goto(`${APP_URL}/home`);
  await loaded(page);
  check((await page.locator(`img[src="/api/avatars/${avatarId}/small"]`).count()) >= 1, "it shows in the app, not only on the account page");

  const notImage = await page.request.post(`${APP_URL}/api/avatar`, {
    multipart: { file: { name: "x.png", mimeType: "image/png", buffer: Buffer.from("not an image at all") } },
  });
  check(notImage.status() === 415, "a file that isn't an image is refused", `${notImage.status()}`);

  await page.goto(`${APP_URL}/account`);
  await hydrated(page, 'input[aria-label="Profile picture"]');
  await page.getByRole("button", { name: "Remove" }).click();
  let cleared = false;
  for (let i = 0; i < 40 && !cleared; i++) {
    const [r] = await sql`select avatar_id, (select count(*)::int from avatars where user_id = ${tester.id}) as n from users where id = ${tester.id}`;
    cleared = r.avatar_id === null && r.n === 0;
    if (!cleared) await page.waitForTimeout(250);
  }
  check(cleared, "removing it deletes the picture");
  await ctx.close();
}

/* ------------------------------------------------------ plain-text posts */

console.log("\nPlain-text posts");
{
  // A post is its text: no photos, GIFs, polls, emoji picker or link cards.
  const [tester] = await sql`select id from users where email = ${TESTER_EMAIL}`;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addCookies([await sessionCookie(TESTER_EMAIL)]);
  const page = await ctx.newPage();
  await page.goto(`${APP_URL}/home`);
  await loaded(page);
  await hydrated(page, "#compose-body");
  const form = page.locator("form#compose");
  const buttons = await form.getByRole("button").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") || e.textContent.trim()));
  check(
    (await form.locator('input[type="file"]').count()) === 0 && buttons.length === 1 && buttons[0] === "Post",
    "the composer is a text box and a Post button",
    JSON.stringify(buttons),
  );
  check(await form.getByRole("button", { name: "Post", exact: true }).isDisabled(), "an empty post can't be sent");

  // A link stays a link in the text, with no card under it.
  const text = `plain e2e ${Date.now()} https://example.com/story`;
  await page.locator("#compose-body").fill(text);
  await form.getByRole("button", { name: "Post", exact: true }).click();
  let posted;
  for (let i = 0; i < 40 && !posted; i++) {
    [posted] = await sql`select id from posts where author_id = ${tester.id} and body = ${text}`;
    if (!posted) await page.waitForTimeout(250);
  }
  check(Boolean(posted), "a text post goes out");
  await page.goto(`${APP_URL}/p/${posted.id}`);
  await loaded(page);
  const article = page.locator("article").first();
  check((await article.locator('a[href="https://example.com/story"]').count()) === 1, "a link in it is still a link");
  check((await article.locator('img:not([src^="/api/avatars/"])').count()) === 0, "and nothing is drawn under it");

  // The photo routes are gone. (A GET: Next answers a multipart POST to any
  // unknown path as a server action it can't find, which is a 500.)
  const media = await page.request.get(`${APP_URL}/api/media/00000000-0000-4000-8000-000000000000`);
  check(media.status() === 404, "photo uploads are gone", `${media.status()}`);
  await sql`delete from posts where id = ${posted.id}`;
  await ctx.close();
}

/* ------------------------------- back to the same spot, replies, quotes */

console.log("\nBack to the same spot, reply popup, quotes, profile");
{
  const [admin] = await sql`select id, username from users where email = ${ADMIN_EMAIL}`;
  const [tester] = await sql`select id, username from users where email = ${TESTER_EMAIL}`;
  // Seventy posts from someone the tester follows: three pages of Following.
  await sql`insert into user_follows (follower_id, followee_id) values (${tester.id}, ${admin.id}) on conflict do nothing`;
  await sql`insert into posts (author_id, body, created_at)
            select ${admin.id}, 'e2e filler ' || lpad(n::text, 2, '0'), now() - make_interval(mins => n)
            from generate_series(1, 70) n`;

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addCookies([await sessionCookie(TESTER_EMAIL)]);
  const page = await ctx.newPage();
  await page.goto(`${APP_URL}/home?tab=following`);
  await loaded(page);
  await hydrated(page, "article button");
  // Scroll until the second page is in, then open a post from it.
  for (let i = 0; i < 20 && (await page.getByText("e2e filler 45", { exact: true }).count()) === 0; i++) {
    await page.mouse.wheel(0, 1500);
    await page.waitForTimeout(300);
  }
  const target = page.locator("article", { hasText: "e2e filler 45" }).first();
  await target.scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, -200);
  await page.waitForTimeout(300);
  const yBefore = await page.evaluate(() => scrollY);
  const topBefore = (await target.boundingBox())?.y;
  await target.locator("p", { hasText: "e2e filler 45" }).click();
  await page.waitForURL(/\/p\//);
  await page.getByRole("link", { name: "Back", exact: true }).click();
  await page.waitForURL(/\/home\?tab=following/);
  // The list holds the spot for 1.5s while the page settles (load-more.tsx).
  await page.waitForTimeout(1800);
  check((await page.getByText("e2e filler 45", { exact: true }).count()) === 1, "back from a post keeps what infinite scroll had loaded");
  // Where it matters: the post you opened is where it was on screen.
  const topAfter = (await page.locator("article", { hasText: "e2e filler 45" }).first().boundingBox())?.y;
  check(
    yBefore > 1000 && topBefore !== undefined && topAfter !== undefined && Math.abs(topAfter - topBefore) < 24,
    "and the post you opened is back where it was on screen",
    `scrollY=${yBefore} top before=${topBefore} after=${topAfter}`,
  );

  // Reply from the timeline: a popup, and the timeline stays put.
  const row = page.locator("article", { hasText: "e2e filler 44" }).first();
  await row.getByRole("button", { name: /^Reply/ }).click();
  const dialog = page.getByRole("dialog");
  check(await dialog.getByText(`@${admin.username}`, { exact: true }).last().isVisible(), "Reply opens a popup with the post being answered");
  await dialog.locator("textarea").fill("e2e popup reply");
  await dialog.getByRole("button", { name: "Reply", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  const [reply] = await sql`select p.id from posts p join posts parent on parent.id = p.parent_id
                            where p.author_id = ${tester.id} and p.body = 'e2e popup reply' and parent.body = 'e2e filler 44'`;
  check(Boolean(reply) && page.url().includes("/home"), "the reply is posted without leaving the timeline");

  // Quote: Repost's menu → Quote → a post with the quoted one under it.
  const quoted = page.locator("article", { hasText: "e2e filler 43" }).first();
  await quoted.getByRole("button", { name: /^Repost or quote/ }).click();
  await page.getByRole("menuitem", { name: "Quote" }).click();
  const qd = page.getByRole("dialog");
  check(await qd.getByText("e2e filler 43").isVisible(), "Quote shows the post being quoted");
  await qd.locator("textarea").fill("e2e quote take");
  await qd.getByRole("button", { name: "Post", exact: true }).click();
  await qd.waitFor({ state: "hidden" });
  const [quote] = await sql`select q.id from posts q join posts o on o.id = q.quote_id
                            where q.author_id = ${tester.id} and q.body = 'e2e quote take' and o.body = 'e2e filler 43'`;
  check(Boolean(quote), "the quote post points at the quoted one");
  const [qn] = await sql`select 1 from notifications where user_id = ${admin.id} and kind = 'quote' and post_id = ${quote?.id ?? null}`;
  check(Boolean(qn), "the quoted author is notified");
  await page.goto(`${APP_URL}/p/${quote?.id}`);
  await loaded(page);
  check(await page.getByRole("link", { name: /^Quoted post by/ }).isVisible(), "the quote shows the quoted post as a card");

  // Profile: posts and replies together, and Stats is a tab of your own profile only.
  await page.goto(`${APP_URL}/u/${tester.username}`);
  await loaded(page);
  let html = await page.content();
  check(html.includes("e2e popup reply") && html.includes("e2e quote take"), "a profile's Posts has replies too");
  check((await page.getByRole("link", { name: "Likes" }).count()) === 0, "there is no Likes tab");
  await page.getByRole("link", { name: "Stats", exact: true }).click();
  await page.waitForURL(/tab=stats/);
  const views = page.locator('nav[aria-label="Stats"] a');
  check((await views.count()) === 3, "Stats has Overview, Picks and Parlays inside it");
  await page.goto(`${APP_URL}/stats?tab=parlays`);
  await loaded(page);
  check(/\/u\/[^?]+\?tab=stats&view=parlays/.test(page.url()), "/stats leads to the profile's Stats", page.url());
  await page.goto(`${APP_URL}/u/${admin.username}`);
  await loaded(page);
  check((await page.getByRole("link", { name: "Stats", exact: true }).count()) === 0, "someone else's profile has no Stats tab");
  html = await page.content();
  check(!html.includes("Bets logged"), "and shows none of their record");
  await ctx.close();

  await sql`delete from posts where author_id = ${tester.id} and body in ('e2e popup reply', 'e2e quote take')`;
  await sql`delete from posts where author_id = ${admin.id} and body like 'e2e filler %'`;
  await sql`delete from user_follows where follower_id = ${tester.id} and followee_id = ${admin.id}`;
}

/* ------------------------------------------- notifications and @mentions */

console.log("\nNotifications and @mentions");
{
  const [admin] = await sql`select id, username from users where email = ${ADMIN_EMAIL}`;
  const [tester] = await sql`select id from users where email = ${TESTER_EMAIL}`;
  const [target] = await sql`insert into posts (author_id, body) values (${admin.id}, 'e2e notification target') returning id`;
  const waitFor = async (query) => {
    for (let i = 0; i < 40; i++) {
      const rows = await query();
      if (rows.length) return rows[0];
      await new Promise((r) => setTimeout(r, 250));
    }
    return null;
  };

  // The tester likes the admin's post, then mentions them, picking the
  // handle from the composer's suggestions.
  const ctx = await browser.newContext();
  await ctx.addCookies([await sessionCookie(TESTER_EMAIL)]);
  const page = await ctx.newPage();
  await page.goto(`${APP_URL}/p/${target.id}`);
  await loaded(page);
  await hydrated(page, "article button");
  await page.locator("article").first().getByRole("button", { name: /^Like/ }).click();
  const liked = await waitFor(
    () => sql`select 1 from notifications where user_id = ${admin.id} and actor_id = ${tester.id} and kind = 'like' and post_id = ${target.id}`,
  );
  check(Boolean(liked), "a like notifies the post's author");

  await page.goto(`${APP_URL}/home`);
  await loaded(page);
  await hydrated(page, "#compose-body");
  await page.locator("#compose-body").click();
  await page.keyboard.type(`hey @${admin.username.slice(0, 4)}`);
  const option = page.getByRole("option", { name: new RegExp(`@${admin.username}`) });
  await option.waitFor({ timeout: 5000 }).catch(() => {});
  check(await option.isVisible(), "typing @ suggests people to mention");
  // A slow phone (and CI): frames late by 40ms. Picking used to place the
  // caret a frame later, so typing in that gap scrambled the words.
  await page.evaluate(() => {
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => setTimeout(() => raf(cb), 40);
  });
  await page.keyboard.press("Enter");
  check((await page.inputValue("#compose-body")) === `hey @${admin.username} `, "picking one writes the handle");
  // Typed at a person's pace, so keys land before and after that late frame.
  await page.keyboard.type("see this e2e", { delay: 25 });
  await page.locator("form#compose").getByRole("button", { name: "Post", exact: true }).click();
  // Two checks, so a failure says which half broke.
  const posted = await waitFor(() => sql`select 1 from posts where author_id = ${tester.id} and body like '%see this e2e'`);
  const [latest] = await sql`select body from posts where author_id = ${tester.id} order by created_at desc limit 1`;
  check(Boolean(posted), "the post with the mention is published", posted ? "" : `latest post: ${JSON.stringify(latest?.body ?? null)}`);
  const mention = await waitFor(
    () => sql`select n.post_id from notifications n join posts p on p.id = n.post_id
              where n.user_id = ${admin.id} and n.kind = 'mention' and p.body like '%see this e2e'`,
  );
  check(Boolean(mention), "the mention notifies who was mentioned");
  await ctx.close();

  // The admin sees the badge, then the page, which reads them.
  const adminCtx = await browser.newContext();
  await adminCtx.addCookies([await sessionCookie(ADMIN_EMAIL)]);
  const adminPage = await adminCtx.newPage();
  await adminPage.goto(`${APP_URL}/home`);
  await loaded(adminPage);
  const badged = adminPage.getByRole("link", { name: /^Notifications, \d+ unread$/ });
  check((await badged.count()) === 1, "the nav shows an unread count");
  await adminPage.goto(`${APP_URL}/notifications`);
  await loaded(adminPage);
  let html = await adminPage.content();
  check(html.includes("liked your post") && html.includes("see this e2e"), "the page lists the like and the mention");
  await adminPage.goto(`${APP_URL}/notifications?tab=mentions`);
  await loaded(adminPage);
  html = await adminPage.content();
  check(html.includes("see this e2e") && !html.includes("liked your post"), "Mentions shows only mentions and replies");
  const read = await waitFor(
    () => sql`select 1 where not exists (select 1 from notifications where user_id = ${admin.id} and read_at is null)`,
  );
  check(Boolean(read), "opening the page marks them read");
  await adminPage.goto(`${APP_URL}/home`);
  await loaded(adminPage);
  check((await adminPage.getByRole("link", { name: "Notifications", exact: true }).count()) === 1, "and the badge clears");
  await adminCtx.close();

  // Taking the like back takes the notification with it.
  const again = await browser.newContext();
  await again.addCookies([await sessionCookie(TESTER_EMAIL)]);
  const p2 = await again.newPage();
  await p2.goto(`${APP_URL}/p/${target.id}`);
  await loaded(p2);
  await hydrated(p2, "article button");
  await p2.locator("article").first().getByRole("button", { name: /^Unlike/ }).click();
  const gone = await waitFor(
    () => sql`select 1 where not exists (select 1 from notifications where user_id = ${admin.id} and kind = 'like' and post_id = ${target.id})`,
  );
  check(Boolean(gone), "unliking removes the notification");
  await again.close();

  await sql`delete from posts where author_id = ${tester.id} and body like '%see this e2e'`;
  await sql`delete from posts where id = ${target.id}`;
}

/* ----------------------------------------- moderation, and audit fixes */

console.log("\nMute, block, report — and the audit's fixes");
{
  const [admin] = await sql`select id, username from users where email = ${ADMIN_EMAIL}`;
  const [tester] = await sql`select id, username from users where email = ${TESTER_EMAIL}`;
  await sql`insert into user_follows (follower_id, followee_id) values (${tester.id}, ${admin.id}) on conflict do nothing`;
  const [target] = await sql`insert into posts (author_id, body) values (${admin.id}, 'e2e mod target') returning id`;

  const ctx = await browser.newContext();
  await ctx.addCookies([await sessionCookie(TESTER_EMAIL)]);
  const page = await ctx.newPage();
  const inFollowing = async () => {
    await page.goto(`${APP_URL}/home?tab=following`);
    await loaded(page);
    return (await page.getByText("e2e mod target", { exact: true }).count()) > 0;
  };
  check(await inFollowing(), "a followed account's post is in Following");

  // Mute from their profile: gone from Following; unmute: back.
  const profileMenu = async (item) => {
    await page.goto(`${APP_URL}/u/${admin.username}`);
    await loaded(page);
    await hydrated(page, "button");
    await page.getByRole("button", { name: `More about @${admin.username}` }).click();
    await page.getByRole("menuitem", { name: item }).click();
  };
  await profileMenu(`Mute @${admin.username}`);
  await page.waitForTimeout(800);
  check(!(await inFollowing()), "muting takes their posts out of your feed");
  await profileMenu(`Unmute @${admin.username}`);
  await page.waitForTimeout(800);
  check(await inFollowing(), "unmuting brings them back");

  // Report the post from its ⋯ menu; the admin removes it from the queue.
  await page.goto(`${APP_URL}/p/${target.id}`);
  await loaded(page);
  await hydrated(page, "article button");
  await page.locator("article").first().getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Report post" }).click();
  const rd = page.getByRole("dialog");
  await rd.getByRole("radio", { name: /^Spam/ }).click();
  await rd.locator("#report-note").fill("e2e report note");
  await rd.getByRole("button", { name: "Send report" }).click();
  await rd.waitFor({ state: "hidden" });
  const [report] = await sql`select id, reason, post_body from reports where post_id = ${target.id} and reporter_id = ${tester.id}`;
  check(report?.reason === "spam" && report.post_body === "e2e mod target", "a report reaches the admins' queue", `${report?.reason}`);

  const adminCtx = await browser.newContext();
  await adminCtx.addCookies([await sessionCookie(ADMIN_EMAIL)]);
  const adminPage = await adminCtx.newPage();
  await adminPage.goto(`${APP_URL}/admin/reports`);
  await loaded(adminPage);
  await hydrated(adminPage, "li[data-report-id] button");
  const item = adminPage.locator("li[data-report-id]", { hasText: "e2e mod target" });
  await item.getByRole("button", { name: "Remove post" }).click();
  await adminPage.getByRole("alertdialog").getByRole("button", { name: "Remove post" }).click();
  let removed;
  for (let i = 0; i < 20 && !removed; i++) {
    [removed] = await sql`select 1 where not exists (select 1 from posts where id = ${target.id})`;
    if (!removed) await adminPage.waitForTimeout(250);
  }
  const [after] = await sql`select outcome, post_body from reports where id = ${report?.id ?? null}`;
  check(Boolean(removed) && after?.outcome === "removed" && after.post_body === "e2e mod target", "removing it deletes the post and keeps the report's copy");

  // Block from their profile: follows end, and the two of you are walled off.
  const [mine] = await sql`insert into posts (author_id, body) values (${tester.id}, 'e2e blocked post') returning id`;
  await page.goto(`${APP_URL}/u/${admin.username}`);
  await loaded(page);
  await hydrated(page, "button");
  await page.getByRole("button", { name: `More about @${admin.username}` }).click();
  await page.getByRole("menuitem", { name: `Block @${admin.username}` }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Block", exact: true }).click();
  await page.waitForTimeout(800);
  const [blocked] = await sql`select 1 from user_blocks where blocker_id = ${tester.id} and blocked_id = ${admin.id}`;
  const [stillFollows] = await sql`select 1 from user_follows where follower_id = ${tester.id} and followee_id = ${admin.id}`;
  check(Boolean(blocked) && !stillFollows, "blocking records it and ends the follow");
  await adminPage.goto(`${APP_URL}/u/${tester.username}`);
  await loaded(adminPage);
  check(await adminPage.getByText(`@${tester.username} blocked you`).isVisible(), "the blocked account sees it on the profile");
  await adminPage.goto(`${APP_URL}/p/${mine.id}`);
  await loaded(adminPage);
  check(await adminPage.getByText("You can't see this post").isVisible(), "and can't open the blocker's posts");
  await sql`delete from user_blocks where blocker_id = ${tester.id}`;
  await sql`delete from posts where id = ${mine.id}`;

  // A role change asks first; Cancel leaves it as it was.
  await adminPage.goto(`${APP_URL}/admin/users`);
  await loaded(adminPage);
  check((await adminPage.locator(`tr[data-user-id="${tester.id}"]`).count()) === 1, "the users directory lists the tester");
  await adminPage.goto(`${APP_URL}/admin/users/${tester.id}`);
  await loaded(adminPage);
  await hydrated(adminPage, "button[role=combobox]");
  await adminPage.getByRole("combobox", { name: `Role for ${TESTER_EMAIL}` }).click();
  await adminPage.getByRole("option", { name: "admin" }).click();
  const roleDialog = adminPage.getByRole("alertdialog");
  check(await roleDialog.getByText("Make this an admin?").isVisible(), "changing a role asks first");
  await roleDialog.getByRole("button", { name: "Cancel" }).click();
  await adminPage.waitForTimeout(500);
  const [{ role }] = await sql`select role from users where id = ${tester.id}`;
  check(role === "user", "and Cancel changes nothing", `role=${role}`);

  // For you: a post and a reply to it on one page show the post once.
  const [parentPost] = await sql`insert into posts (author_id, body) values (${admin.id}, 'e2e dedupe parent') returning id`;
  await sql`insert into posts (author_id, parent_id, body) values (${admin.id}, ${parentPost.id}, 'e2e dedupe reply')`;
  // And a mention of nobody isn't a link.
  const [mentionPost] = await sql`insert into posts (author_id, body) values (${admin.id}, ${`e2e hi @nosuchuser9 and @${admin.username}`}) returning id`;
  await page.goto(`${APP_URL}/home`);
  await loaded(page);
  check((await page.getByText("e2e dedupe parent", { exact: true }).count()) === 1, "For you shows a post once, above its reply");
  await page.goto(`${APP_URL}/p/${mentionPost.id}`);
  await loaded(page);
  const body = page.locator("article p", { hasText: "e2e hi" }).first();
  check(
    (await body.locator('a[href="/u/nosuchuser9"]').count()) === 0 && (await body.locator(`a[href="/u/${admin.username}"]`).count()) === 1,
    "a mention links only when the account exists",
  );
  await sql`delete from posts where id in (${parentPost.id}, ${mentionPost.id})`;
  await sql`delete from user_follows where follower_id = ${tester.id} and followee_id = ${admin.id}`;
  await adminCtx.close();
  await ctx.close();

  // A wrong password keeps the email that was typed.
  const loginCtx = await browser.newContext();
  const lp = await loginCtx.newPage();
  await lp.goto(`${APP_URL}/login`);
  await loaded(lp);
  await hydrated(lp);
  await lp.fill("#email", TESTER_EMAIL);
  await lp.fill("#password", "definitely-not-the-password");
  await lp.getByRole("button", { name: /^Sign in/ }).click();
  await lp.getByRole("alert").first().waitFor({ timeout: 10_000 }).catch(() => {});
  check((await lp.inputValue("#email")) === TESTER_EMAIL, "a failed sign-in keeps the email");
  await loginCtx.close();
}

/* -------------------------------------------------------------- feedback */

console.log("\nFeedback");

const feedbackNote = `e2e feedback ${Date.now()}`;
{
  // A tester sends it from the sidebar; it lands with the page it came from.
  const ctx = await browser.newContext();
  await ctx.addCookies([await sessionCookie(TESTER_EMAIL)]);
  const page = await ctx.newPage();
  await page.goto(`${APP_URL}/picks`);
  await loaded(page);
  await hydrated(page, 'nav button[title="Send feedback"]');
  await page.getByRole("button", { name: "Send feedback" }).click();
  const dialog = page.getByRole("dialog");
  const send = dialog.getByRole("button", { name: "Send", exact: true });
  check(await send.isDisabled(), "Send waits for a kind and a message");
  await dialog.getByRole("button", { name: "Idea", exact: true }).click();
  await dialog.locator("#feedback-body").fill(feedbackNote);
  await send.click();
  await dialog.waitFor({ state: "hidden" });
  const [row] = await sql`
    select f.kind, f.page_path, f.user_agent, u.email from feedback f
    join users u on u.id = f.user_id where f.body = ${feedbackNote}
  `;
  check(row?.email === TESTER_EMAIL && row.kind === "idea", "feedback is stored against the tester", `${row?.kind}`);
  check(row?.page_path === "/picks" && Boolean(row.user_agent), "it carries the page and the browser", `${row?.page_path}`);
  await ctx.close();
}
{
  // On a phone it's in the drawer, which steps aside for the dialog.
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addCookies([await sessionCookie(TESTER_EMAIL)]);
  const page = await ctx.newPage();
  await page.goto(`${APP_URL}/picks`);
  await loaded(page);
  await hydrated(page, "button");
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Send feedback" }).click();
  await page.getByRole("dialog", { name: "Send feedback" }).waitFor();
  check((await page.getByRole("dialog").count()) === 1, "the drawer closes and the feedback dialog opens");
  await ctx.close();
}
{
  // An admin reads it, resolves it, and finds it under Resolved.
  const ctx = await browser.newContext();
  await ctx.addCookies([await sessionCookie(ADMIN_EMAIL)]);
  const page = await ctx.newPage();
  const res = await page.goto(`${APP_URL}/admin/feedback`);
  await loaded(page);
  check(res.status() === 200, "admin opens the feedback inbox", `${res.status()}`);
  const item = page.locator("li[data-feedback-id]", { hasText: feedbackNote });
  check((await item.count()) === 1, "the tester's feedback is listed as open");
  await hydrated(page, "li[data-feedback-id] button");
  await item.getByRole("button", { name: "Mark resolved" }).click();
  await item.waitFor({ state: "detached" });
  const [row] = await sql`select resolved_at, resolved_by from feedback where body = ${feedbackNote}`;
  check(row?.resolved_at !== null && row?.resolved_by === seedAdmin.id, "resolving records when and by whom");
  await page.goto(`${APP_URL}/admin/feedback?show=resolved`);
  await loaded(page);
  check((await page.locator("li[data-feedback-id]", { hasText: feedbackNote }).count()) === 1, "it moves to Resolved");
  await ctx.close();
}
await sql`delete from feedback where body = ${feedbackNote}`;

/* ------------------------------------- suspension, and deleting your account */

console.log("\nSuspending an account, and deleting your own");
const goneEmail = `e2e-suspend-${Date.now()}@example.com`;
{
  const password = "a-real-password-1";
  const [acct] = await sql`
    insert into users (email, password_hash, role, email_verified_at, username)
    values (${goneEmail}, ${await bcrypt.hash(password, 10)}, 'user', now(), ${"sus_" + randomBytes(4).toString("hex")})
    returning id, username`;
  const [post] = await sql`insert into posts (author_id, body) values (${acct.id}, 'Posted before the suspension') returning id`;
  const theirs = await browser.newContext();
  await theirs.addCookies([await sessionCookie(goneEmail)]);
  const them = await theirs.newPage();

  // An admin suspends them; a reason is asked for first.
  const adminCtx = await browser.newContext();
  await adminCtx.addCookies([await sessionCookie(ADMIN_EMAIL)]);
  const admin = await adminCtx.newPage();
  await admin.goto(`${APP_URL}/admin/users/${acct.id}`);
  await loaded(admin);
  await hydrated(admin, "button");
  await admin.getByRole("button", { name: "Suspend", exact: true }).first().click();
  const dialog = admin.getByRole("alertdialog");
  await dialog.getByRole("button", { name: "Suspend", exact: true }).click();
  check(await dialog.getByText("Say why").isVisible(), "suspending asks for a reason first");
  await dialog.locator("#suspend-reason").fill("e2e: spam");
  await dialog.getByRole("button", { name: "Suspend", exact: true }).click();
  let row;
  for (let i = 0; i < 40 && !row?.suspended_at; i++) {
    await admin.waitForTimeout(250);
    [row] = await sql`select suspended_at, suspended_reason, suspended_by from users where id = ${acct.id}`;
  }
  check(Boolean(row?.suspended_at) && row.suspended_reason === "e2e: spam" && row.suspended_by === seedAdmin.id, "the suspension is recorded with its reason");
  const [{ n: live }] = await sql`select count(*)::int as n from sessions where user_id = ${acct.id}`;
  check(live === 0, "suspending signs them out everywhere", `sessions=${live}`);

  // They're out, and the right password says why.
  await them.goto(`${APP_URL}/home`);
  check(them.url().includes("/login"), "a suspended account's old cookie reads as signed out", them.url());
  await hydrated(them, 'form input[name="email"]');
  await them.fill('input[name="email"]', goneEmail);
  await them.fill('input[name="password"]', password);
  await them.click('button[type="submit"]');
  check(
    await them.getByText("This account is suspended").waitFor({ timeout: 10000 }).then(() => true, () => false),
    "signing in with the right password says the account is suspended",
  );

  // Nobody else sees what they posted.
  const other = await browser.newContext();
  await other.addCookies([await sessionCookie(TESTER_EMAIL)]);
  const viewer = await other.newPage();
  // /p has a loading skeleton, so a missing post streams a not-found page with
  // a 200 — what counts is that the post itself isn't there.
  await viewer.goto(`${APP_URL}/p/${post.id}`);
  await loaded(viewer);
  check(!(await viewer.content()).includes("Posted before the suspension"), "their post is gone while suspended");
  await viewer.goto(`${APP_URL}/u/${acct.username}`);
  await loaded(viewer);
  check(await viewer.getByText("This account is suspended").isVisible(), "their profile says it's suspended");

  // Lifted, everything comes back.
  await admin.reload();
  await loaded(admin);
  await hydrated(admin, "button");
  await admin.getByRole("button", { name: "Unsuspend", exact: true }).first().click();
  await admin.getByRole("alertdialog").getByRole("button", { name: "Unsuspend", exact: true }).click();
  for (let i = 0; i < 40 && row?.suspended_at; i++) {
    await admin.waitForTimeout(250);
    [row] = await sql`select suspended_at from users where id = ${acct.id}`;
  }
  check(row?.suspended_at === null, "unsuspending lifts it");
  await viewer.goto(`${APP_URL}/p/${post.id}`);
  await loaded(viewer);
  check(
    await viewer.getByText("Posted before the suspension").first().waitFor({ timeout: 10000 }).then(() => true, () => false),
    "and their post shows again",
  );
  await other.close();
  await adminCtx.close();

  // Then they delete their own account: the password again, and a ticked box.
  await theirs.addCookies([await sessionCookie(goneEmail)]);
  await them.goto(`${APP_URL}/account`);
  await loaded(them);
  await hydrated(them, "#delete-password");
  await them.fill("#delete-password", "not-my-password");
  await them.locator('input[type="checkbox"][name="confirm"]').check();
  await them.getByRole("button", { name: "Delete my account" }).click();
  check(
    await them.getByText("That isn't your password").waitFor({ timeout: 10000 }).then(() => true, () => false),
    "deleting refuses the wrong password",
  );
  const [{ n: still }] = await sql`select count(*)::int as n from users where id = ${acct.id}`;
  check(still === 1, "and keeps the account");
  await them.fill("#delete-password", password);
  const box = them.locator('input[type="checkbox"][name="confirm"]');
  if (!(await box.isChecked())) await box.check();
  await them.getByRole("button", { name: "Delete my account" }).click();
  await them.waitForURL("**/account-deleted", { timeout: 15000 }).catch(() => {});
  check(them.url().includes("/account-deleted"), "deleting lands on the goodbye page", them.url());
  const [{ n: users }] = await sql`select count(*)::int as n from users where id = ${acct.id}`;
  const [{ n: postsLeft }] = await sql`select count(*)::int as n from posts where author_id = ${acct.id}`;
  check(users === 0 && postsLeft === 0, "the account and its posts are gone", `users=${users} posts=${postsLeft}`);
  const [logged] = await sql`select actor_email from audit_log where action = 'user.deleted' and entity_id = ${acct.id}`;
  check(Boolean(logged) && logged.actor_email === null, "the deletion is logged without the email");
  await them.goto(`${APP_URL}/home`);
  check(them.url().includes("/login"), "and they're signed out", them.url());
  await theirs.close();
}

/* ------------------------------------------------------------- teardown */

// The test users' own sessions cascade with their rows; only the ones minted
// above need clearing. A blanket delete here would sign out real sessions.
await sql`delete from users where email in (${testEmail}, ${quietEmail}, ${secondAdmin}, ${goneEmail})`;
await sql`delete from signup_surveys where email in (${testEmail}, ${quietEmail})`;
await dropTester(sql, TESTER_EMAIL);
await sql`delete from invitations where email in (${testEmail}, ${quietEmail})`;
await sql`delete from sessions where token_hash = any(${mintedSessions})`;
await dropSlate(sql, latestSlate);
await browser.close();

console.log(failures === 0 ? "\n✓ All flow tests passed.\n" : `\n✗ ${failures} failed.\n`);
await sql.end();
process.exit(failures === 0 ? 0 : 1);
