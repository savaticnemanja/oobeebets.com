/**
 * Test fixtures: a published slate the suites can assert against.
 *
 * `npm run db:seed` deliberately creates accounts and nothing else — a product
 * whose whole claim is that its record is real has no business shipping a
 * fabricated one, even as a dev convenience. So the picks each suite needs are
 * built here, at the start of the run, and dropped at the end of it.
 *
 * The shape is not arbitrary. Both the board-visibility checks and the
 * per-sport /top-picks checks are only meaningful if the slate is longer than
 * the free limit *and* each sport holds ranks on both sides of it — otherwise
 * a truncation bug passes because there was nothing to truncate.
 */

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
 * Odd ranks are MLB, even are NFL, so each sport straddles the free limit.
 * Ranks 1..SETTLED started three hours ago and carry a result; the rest start
 * in the future and stay pending, which is what the settle flow needs to find.
 */
export async function createSlate(sql, { date, publishedBy, count = 24, settled = 12 }) {
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
