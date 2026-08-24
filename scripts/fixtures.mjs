/**
 * Test fixtures: a published slate the suites can assert against.
 *
 * `npm run db:seed` deliberately creates one admin account and nothing else — a
 * product whose whole claim is that its record is real has no business shipping
 * a fabricated one, even as a dev convenience. So the picks each suite needs,
 * and the plain user that views them, are built here at the start of the run
 * and dropped at the end of it.
 *
 * The slate is sized from PICKS_PER_SLATE, so it tracks the product rather
 * than a number written down twice — and it has to, since picks_rank_range
 * rejects anything above that bound at the database.
 *
 * Note that while PICKS_PER_SLATE equals VISIBLE_PICKS, no fixture can put a
 * rank past the free limit, so the truncation checks in verify.mjs cannot bite
 * on a real board. The synthetic visiblePicks() contract test covers that
 * logic directly; these fixtures cover everything else.
 */
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { PICKS_PER_SLATE } from "../src/lib/board.ts";

/**
 * The non-admin viewer the suites need. The seed creates one admin and nothing
 * else, so a plain user is a fixture like any other: made at the start of a
 * run, dropped at the end of it, and never a standing login.
 *
 * Its password is a hash of random bytes nobody keeps, so the account exists
 * for session-cookie tests only — it cannot be signed into.
 */
export const TESTER_EMAIL = "fixture-tester@oobeebets.test";

export async function ensureTester(sql, email = TESTER_EMAIL) {
  const passwordHash = await bcrypt.hash(randomBytes(24).toString("base64url"), 10);
  const [user] = await sql`
    insert into users (email, password_hash, role, email_verified_at)
    values (${email}, ${passwordHash}, 'user', now())
    on conflict (email) do update set password_hash = ${passwordHash}
    returning id, email
  `;
  return user;
}

/** Sessions cascade with the row, so this signs out anything minted for it. */
export async function dropTester(sql, email = TESTER_EMAIL) {
  await sql`delete from users where email = ${email}`;
}

/** Odds spread across favourites and dogs so the maths has something to chew. */
const PRICES = [-110, -125, +105, -150, +140, -200, +175, -105];

const GAMES = {
  baseball: {
    league: "MLB",
    events: [
      "Baltimore Orioles vs Detroit Tigers",
      "Chicago Cubs vs St. Louis Cardinals",
      "Texas Rangers vs Tampa Bay Rays",
    ],
    selections: ["Over 7.5", "Under 8.5", "Texas Rangers +1.5"],
  },
  football: {
    league: "NFL",
    events: [
      "Kansas City Chiefs vs Buffalo Bills",
      "San Francisco 49ers vs Seattle Seahawks",
      "Dallas Cowboys vs Philadelphia Eagles",
    ],
    selections: ["Buffalo Bills +2.5", "Over 44.5", "Under 51.5"],
  },
};

/** Settled outcomes for the picks whose games have already kicked off. */
const OUTCOMES = ["won", "lost", "won", "push", "lost", "won", "void", "won"];

/**
 * Creates a published slate of `count` picks on `date`.
 *
 * Odd ranks are MLB, even are NFL, so both /top-picks tabs have something in
 * them. Ranks 1..settled started three hours ago and carry a result; the rest
 * start in the future and stay pending, which is what the settle flow needs to
 * find.
 */
export async function createSlate(
  sql,
  { date, publishedBy, count = PICKS_PER_SLATE, settled = Math.floor(PICKS_PER_SLATE / 2) },
) {
  await sql`
    insert into slates (date, published_at, published_by)
    values (${date}, now(), ${publishedBy})
    on conflict (date) do update set published_at = now(), published_by = ${publishedBy}
  `;

  for (let rank = 1; rank <= count; rank++) {
    const sport = rank % 2 === 1 ? "baseball" : "football";
    const g = GAMES[sport];
    const i = rank % 3;
    const isSettled = rank <= settled;
    const price = PRICES[rank % PRICES.length];

    // Settled picks kicked off three hours ago; pending ones are still ahead,
    // staggered so "order by starts_at" is deterministic.
    const startsAt = isSettled
      ? new Date(Date.now() - 3 * 3600_000)
      : new Date(Date.now() + (rank - settled) * 15 * 60_000);

    const status = isSettled ? OUTCOMES[rank % OUTCOMES.length] : "pending";

    await sql`
      insert into picks (
        slate_date, rank, sport, league, event, starts_at, market, selection,
        price, units, confidence, ev_pct, reasoning,
        status, final_score, settled_at, settled_by, void_reason
      ) values (
        ${date}, ${rank}, ${sport}::sport, ${g.league}, ${g.events[i]},
        ${startsAt}, ${"total"}::market, ${g.selections[i]},
        ${price}, ${"1.00"}, ${Math.max(50, 82 - rank)}, ${(rank % 7) + 1.5},
        ${rank <= 3 ? "Fixture pick — created by the test suite." : null},
        ${status}::pick_status,
        ${status === "won" || status === "lost" ? "4-2" : null},
        ${isSettled ? new Date() : null},
        ${isSettled ? publishedBy : null},
        ${status === "void" ? "Game postponed — no action." : null}
      )
    `;
  }

  const [{ n }] = await sql`select count(*)::int as n from picks where slate_date = ${date}`;
  return { date, count: n };
}

/** Removes the slate and everything hanging off it. Picks cascade with it. */
export async function dropSlate(sql, date) {
  await sql`delete from picks where slate_date = ${date}`;
  await sql`delete from slates where date = ${date}`;
}

/**
 * The app's own slate day, computed the same way the app computes it — a
 * betting day starts at 04:00 ET, so between 00:00 and 08:00 UTC the UTC
 * calendar date is a day ahead of the slate the site actually serves.
 */
export { slateDateString } from "../src/lib/slate-date.ts";
