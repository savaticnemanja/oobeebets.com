/**
 * Pre-launch smoke check. Run against the app serving on APP_URL:
 *
 *   npm run build && npm start &
 *   npm run verify
 *
 * The suite this replaced checked settlement maths, tier gating and admin
 * access control — none of which exist in this build. What matters now is
 * narrower and worth stating plainly: the signup page is served at `/`, the
 * legal pages a subscriber is entitled to read are reachable, and the two
 * crawler files describe the site that actually exists.
 *
 * Deliberately no database and no Resend key: this runs in CI, and a check
 * that needs live credentials is a check that gets skipped.
 */

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

let failures = 0;
const pass = (name, extra = "") => console.log(`  PASS  ${name}${extra ? "  " + extra : ""}`);
const fail = (name, extra = "") => {
  failures++;
  console.log(`  FAIL  ${name}${extra ? "  " + extra : ""}`);
};
const check = (cond, name, extra) => (cond ? pass(name, extra) : fail(name, extra));

async function get(path) {
  const res = await fetch(`${APP_URL}${path}`, { redirect: "manual" });
  return { status: res.status, body: await res.text() };
}

/* ------------------------------------------------------------ 1. the pages */

console.log("\nPages");

const home = await get("/");
check(home.status === 200, "/ serves 200", `got ${home.status}`);
check(
  home.body.includes('name="email"') && home.body.includes("Notify me"),
  "/ serves the signup form",
);
check(!home.body.includes("/soon"), "/ is the page, not a redirect to a placeholder");

for (const path of ["/legal/privacy", "/legal/terms", "/unsubscribe"]) {
  const res = await get(path);
  check(res.status === 200, `${path} serves 200`, `got ${res.status}`);
}

const health = await get("/api/health");
check(health.status === 200, "/api/health serves 200", `got ${health.status}`);
check(health.body.includes('"db":"up"'), "/api/health reports the database up");

/* ------------------------------------------------- 2. nothing left behind */

console.log("\nRemoved surfaces are gone");

// If any of these come back, something was reintroduced by accident — this
// build is meant to have no product in it at all.
for (const path of ["/picks", "/pricing", "/admin", "/login", "/account"]) {
  const res = await get(path);
  check(res.status === 404, `${path} is 404`, `got ${res.status}`);
}

/* ---------------------------------------------------------- 3. crawlers */

console.log("\nCrawler files");

const robots = await get("/robots.txt");
check(robots.status === 200, "/robots.txt serves 200", `got ${robots.status}`);
check(robots.body.includes("Disallow: /unsubscribe"), "robots keeps /unsubscribe out");

const sitemap = await get("/sitemap.xml");
check(sitemap.status === 200, "/sitemap.xml serves 200", `got ${sitemap.status}`);
check(sitemap.body.includes("/legal/privacy"), "sitemap lists the privacy policy");
check(
  !sitemap.body.includes("/track-record") && !sitemap.body.includes("/pricing"),
  "sitemap claims no page that no longer exists",
);

/* ------------------------------------------------------- 4. install + share */

console.log("\nManifest and share tags");

// The sitemap was checked for dead routes and the manifest was not, which is
// how start_url sat on /picks — a route the section above asserts is a 404.
// An installed app launching into "Nothing here" is invisible until someone
// installs it, so it gets a check rather than a reread.
const manifest = await get("/manifest.webmanifest");
check(manifest.status === 200, "/manifest.webmanifest serves 200", `got ${manifest.status}`);

let start = null;
try {
  const parsed = JSON.parse(manifest.body);
  start = parsed.start_url;
  const targets = [parsed.start_url, ...(parsed.shortcuts ?? []).map((s) => s.url)];
  const dead = [];
  for (const url of targets) {
    const res = await get(url);
    if (res.status !== 200) dead.push(`${url} -> ${res.status}`);
  }
  check(dead.length === 0, "every manifest destination serves 200", dead.join(", "));
} catch {
  fail("manifest is valid JSON");
}
check(typeof start === "string" && start.length > 0, "manifest declares a start_url", `${start}`);

// Both icon routes and the share image, which are only ever noticed by their
// absence — a 404 here is a blank tab and a bare text link on every share.
for (const path of ["/favicon.ico", "/icon.svg", "/apple-icon.png", "/opengraph-image"]) {
  const res = await get(path);
  check(res.status === 200, `${path} serves 200`, `got ${res.status}`);
}

// og: and twitter: inherit from the root layout unless a page overrides both,
// so the home page's card is checked against the page's own copy.
check(
  home.body.includes('property="og:image"') && home.body.includes('name="twitter:card"'),
  "/ carries an image card",
);
check(
  home.body.includes('property="og:title" content="oobee bets — launching soon"'),
  "/ share card says launching soon, like the page does",
);
check(home.body.includes('application/ld+json'), "/ carries structured data");

/* -------------------------------------------------------------- summary */

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
