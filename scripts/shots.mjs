/** Screenshots each surface as a real signed-in user, for visual review. */
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import postgres from "postgres";
import { chromium } from "playwright";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const OUT = process.env.SHOT_DIR ?? "./.shots";
mkdirSync(OUT, { recursive: true });

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

async function cookieFor(email) {
  const [user] = await sql`select id from users where email = ${email}`;
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await sql`insert into sessions (user_id, token_hash, expires_at)
            values (${user.id}, ${tokenHash}, ${new Date(Date.now() + 3600_000)})`;
  return token;
}

const browser = await chromium.launch();

const SHOTS = [
  { name: "01-landing", path: "/", user: null, full: true },
  { name: "02-track-record", path: "/track-record", user: null, full: true },
  { name: "03-pricing", path: "/pricing", user: null, full: false },
  { name: "04-picks-free", path: "/picks", user: "free@example.com", full: false },
  { name: "05-picks-base", path: "/picks", user: "base@example.com", full: false },
  { name: "06-picks-elite", path: "/picks", user: "elite@example.com", full: false },
  { name: "07-account", path: "/account", user: "pro@example.com", full: false },
  { name: "08-admin", path: "/admin", user: "owner@oobeebets.com", full: false },
  { name: "09-admin-slate", path: "/admin/slate", user: "owner@oobeebets.com", full: false },
  { name: "10-admin-settle", path: "/admin/settle", user: "owner@oobeebets.com", full: false },
  { name: "11-admin-users", path: "/admin/users", user: "owner@oobeebets.com", full: false },
  { name: "12-login", path: "/login", user: null, full: false },
  { name: "13-picks-mobile", path: "/picks", user: "base@example.com", full: false, mobile: true },
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
await sql.end();
console.log(`\nWrote screenshots to ${OUT}`);
