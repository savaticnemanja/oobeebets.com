/** Screenshots each surface as a real signed-in user, for visual review. */
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import postgres from "postgres";
import { chromium } from "playwright";
import { createSlate, dropSlate, ensureTester, dropTester, slateDateString } from "./fixtures.mjs";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const OUT = process.env.SHOT_DIR ?? "./.shots";
mkdirSync(OUT, { recursive: true });

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "nemanjas@oobeebets.com";

// `db:seed` creates accounts and no picks, so a board to photograph has to be
// built here — otherwise every board shot is of an empty state.
const [admin] = await sql`select id from users where email = ${ADMIN_EMAIL}`;
if (!admin) {
  console.error(`No ${ADMIN_EMAIL} account. Run: npm run db:seed`);
  await sql.end();
  process.exit(1);
}
// Every signed-in shot that isn't of the admin panel needs a plain user, and
// the seed no longer ships one; it is created here and removed at the end.
const TESTER_EMAIL = (await ensureTester(sql)).email;

const slateDate = slateDateString();
await dropSlate(sql, slateDate);
await createSlate(sql, { date: slateDate, publishedBy: admin.id });

async function cookieFor(email) {
  const [user] = await sql`select id from users where email = ${email}`;
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await sql`insert into sessions (user_id, token_hash, expires_at)
            values (${user.id}, ${tokenHash}, ${new Date(Date.now() + 3600_000)})`;
  return token;
}

const browser = await chromium.launch();

// Both boards are gated now, so a signed-out shot of either captures the login
// page rather than the surface it is named after.
const SHOTS = [
  { name: "01-landing", path: "/", user: null, full: true },
  { name: "02-top-picks", path: "/top-picks", user: TESTER_EMAIL, full: true },
  { name: "03-picks", path: "/picks", user: TESTER_EMAIL, full: false },
  // The board is two tabs; a shot of only the default one reviews half of it.
  { name: "03b-picks-props", path: "/picks?category=prop", user: TESTER_EMAIL, full: false },
  { name: "04-account", path: "/account", user: TESTER_EMAIL, full: false },
  { name: "05-admin", path: "/admin", user: ADMIN_EMAIL, full: false },
  { name: "06-admin-slate", path: "/admin/slate", user: ADMIN_EMAIL, full: false },
  { name: "06b-admin-slate-props", path: "/admin/slate?category=prop", user: ADMIN_EMAIL, full: false },
  { name: "07-admin-settle", path: "/admin/settle", user: ADMIN_EMAIL, full: false },
  { name: "08-admin-users", path: "/admin/users", user: ADMIN_EMAIL, full: false },
  { name: "09-admin-announce", path: "/admin/announce", user: ADMIN_EMAIL, full: false },
  { name: "10-login", path: "/login", user: null, full: false },
  { name: "11-picks-mobile", path: "/picks", user: TESTER_EMAIL, full: false, mobile: true },
  { name: "12-picks-props-mobile", path: "/picks?category=prop", user: TESTER_EMAIL, full: false, mobile: true },
];

for (const s of SHOTS) {
  const ctx = await browser.newContext({
    viewport: s.mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: "dark",
    // Screenshots are for layout review; motion would make them nondeterministic.
    reducedMotion: "reduce",
  });

  if (s.user) {
    const token = await cookieFor(s.user);
    await ctx.addCookies([
      { name: "oobee_session", value: token, url: APP_URL, httpOnly: true, sameSite: "Lax" },
    ]);
  }

  const page = await ctx.newPage();
  await page.goto(`${APP_URL}${s.path}`, { waitUntil: "networkidle" });

  // Scroll-reveal sections use IntersectionObserver, which never fires for
  // content outside the viewport — and Playwright's fullPage capture does not
  // scroll. Walk the page first so everything has been revealed.
  if (s.full) {
    const height = await page.evaluate(() => document.body.scrollHeight);
    for (let y = 0; y < height; y += 600) {
      await page.evaluate((v) => window.scrollTo(0, v), y);
      await page.waitForTimeout(110);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
  }
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${s.name}.png`, fullPage: s.full });
  console.log(`  ${s.name}  ${s.path}${s.user ? ` (${s.user})` : ""}`);
  await ctx.close();
}

await browser.close();
await sql`delete from sessions where expires_at > now()`;
await dropSlate(sql, slateDate);
await dropTester(sql, TESTER_EMAIL);
await sql.end();
console.log(`\nWrote screenshots to ${OUT}`);
