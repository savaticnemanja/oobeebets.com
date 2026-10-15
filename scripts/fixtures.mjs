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
 * A slate is two ranked lists, game bets and player props, each numbered from
 * 1. Both are built here, because a fixture that only filled one tab would
 * leave the other one's rank cut untested.
 *
 * Note that while PICKS_PER_SLATE equals VISIBLE_PICKS, no fixture can put a
 * rank past the free limit, so the truncation checks in verify.mjs cannot bite
 * on a real board. The synthetic visiblePicks() contract test covers that
 * logic directly; these fixtures cover everything else.
 */
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { PICKS_PER_SLATE, pickCategories } from "../src/lib/board.ts";

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
    insert into users (email, password_hash, role, email_verified_at, username)
    values (${email}, ${passwordHash}, 'user', now(), 't_' || substr(md5(random()::text), 1, 12))
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

/** NFL only, like the site (SPORT_FILTERS in src/lib/board.ts). */
const GAMES = {
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

/**
 * Player props, in the shape the composer writes them: player, side, line and
 * stat composed into one selection string.
 */
const PROPS = {
  football: {
    league: "NFL",
    events: [
      "Kansas City Chiefs vs Buffalo Bills",
      "San Francisco 49ers vs Seattle Seahawks",
      "Dallas Cowboys vs Philadelphia Eagles",
    ],
    selections: [
      "Josh Allen OVER 246.5 Passing Yards",
      "Christian McCaffrey OVER 4.5 Receptions",
      "CeeDee Lamb UNDER 79.5 Receiving Yards",
    ],
  },
};

/**
 * Every selection string a fixture slate can contain, by category. Suites use
 * these to prove a tab serves its own board and not the other one — matching
 * ranks alone can't, since both boards are numbered 1..15.
 */
export const FIXTURE_SELECTIONS = {
  game: Object.values(GAMES).flatMap((g) => g.selections),
  prop: Object.values(PROPS).flatMap((g) => g.selections),
};

/** Settled outcomes for the picks whose games have already kicked off. */
const OUTCOMES = ["won", "lost", "won", "push", "lost", "won", "void", "won"];

/**
 * Creates a published slate on `date`: both boards, each filled to its own
 * limit and each ranked from 1.
 *
 * Every pick is NFL, the one sport the site covers. Ranks 1..settled started three hours ago and carry a result; the rest
 * start in the future and stay pending, which is what the settle flow needs to
 * find.
 *
 * `counts` takes a partial override ({ prop: 0 }) for suites that want one
 * board empty; anything unset falls back to that category's real limit.
 */
export async function createSlate(sql, { date, publishedBy, counts = {} }) {
  await sql`
    insert into slates (date, published_at, published_by)
    values (${date}, now(), ${publishedBy})
    on conflict (date) do update set published_at = now(), published_by = ${publishedBy}
  `;

  const sizes = Object.fromEntries(
    pickCategories.map((c) => [c, counts[c] ?? PICKS_PER_SLATE[c]]),
  );

  for (const category of pickCategories) {
    const count = sizes[category];
    const settled = Math.floor(count / 2);
    const source = category === "prop" ? PROPS : GAMES;
    const market = category === "prop" ? "prop" : "total";

    for (let rank = 1; rank <= count; rank++) {
      const sport = "football";
      const g = source[sport];
      const i = rank % 3;
      const isSettled = rank <= settled;
      const price = PRICES[rank % PRICES.length];

      // Settled picks kicked off three hours ago; pending ones are still
      // ahead, staggered so "order by starts_at" is deterministic.
      const startsAt = isSettled
        ? new Date(Date.now() - 3 * 3600_000)
        : new Date(Date.now() + (rank - settled) * 15 * 60_000);

      const status = isSettled ? OUTCOMES[rank % OUTCOMES.length] : "pending";

      await sql`
        insert into picks (
          slate_date, category, rank, sport, league, event, starts_at, market,
          selection, price, units, confidence, ev_pct, reasoning,
          status, final_score, settled_at, settled_by, void_reason
        ) values (
          ${date}, ${category}::pick_category, ${rank}, ${sport}::sport,
          ${g.league}, ${g.events[i]},
          ${startsAt}, ${market}::market, ${g.selections[i]},
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
  }

  const rows = await sql`
    select category, count(*)::int as n from picks
    where slate_date = ${date} group by category
  `;
  const created = Object.fromEntries(
    pickCategories.map((c) => [c, rows.find((r) => r.category === c)?.n ?? 0]),
  );
  return { date, counts: created, count: rows.reduce((n, r) => n + r.n, 0) };
}

/** Removes the slate and everything hanging off it. Picks cascade with it. */
export async function dropSlate(sql, date) {
  await sql`delete from picks where slate_date = ${date}`;
  await sql`delete from slates where date = ${date}`;
}

/* ---------------------------------------------------------- player stats */

/**
 * An invented NFL season for the Players pages: 1999, far enough back that
 * no real sync ever writes it. Sixty quarterbacks, so the passing table has
 * a second page to scroll into; player 1 leads in passing yards and has a
 * game log. Ids are "nfl:fx-<n>", so dropping them can't touch a real player.
 */
export const STATS_SEASON = 1999;
export const STATS_PLAYERS = 60;

export async function seedStatsFixture(sql) {
  await dropStatsFixture(sql);
  const players = Array.from({ length: STATS_PLAYERS }, (_, i) => {
    const n = i + 1;
    return { id: `nfl:fx-${n}`, league: "NFL", provider_id: `fx-${n}`, name: `Fixture Player ${String(n).padStart(2, "0")}`, team_abbr: "FXT", position: "QB" };
  });
  await sql`insert into stat_players ${sql(players)}`;
  await sql`insert into player_season_stats ${sql(
    players.map((p, i) => ({
      league: "NFL",
      season: STATS_SEASON,
      season_type: "regular",
      player_id: p.id,
      team_abbr: "FXT",
      // Passing yards fall with the number, so player 01 leads and 60
      // trails; the last ten threw too little to qualify.
      games_played: i < 50 ? 17 : 3,
      stats: {
        gp: i < 50 ? 17 : 3,
        pass_cmp: i < 50 ? 350 : 20,
        pass_att: i < 50 ? 550 : 30,
        pass_pct: 63.6,
        pass_yds: 4800 - i * 50,
        pass_ypa: 7.4,
        pass_td: 30 - (i % 20),
        pass_int: 5 + (i % 9),
        pass_ypg: (4800 - i * 50) / 17,
        qbr: 60,
      },
    })),
  )}`;
  await sql`insert into player_game_stats ${sql(
    Array.from({ length: 3 }, (_, g) => ({
      player_id: "nfl:fx-1",
      game_id: `fx-game-${g}`,
      season: STATS_SEASON,
      season_type: "regular",
      played_at: new Date(Date.UTC(1999, 8, 12 + 7 * g)),
      team_abbr: "FXT",
      opponent_abbr: "OPP",
      home: g % 2 === 0,
      team_score: 24 + g,
      opponent_score: 21,
      stats: { pass_cmp: 22, pass_att: 33, pass_yds: 280 + g, pass_td: 2, pass_int: 1, rush_yds: 12 },
    })),
  )}`;
}

export async function dropStatsFixture(sql) {
  // Season and game rows cascade with the players.
  await sql`delete from stat_players where id like 'nfl:fx-%'`;
}

/**
 * The app's own slate day, computed the same way the app computes it — a
 * betting day starts at 04:00 ET, so between 00:00 and 08:00 UTC the UTC
 * calendar date is a day ahead of the slate the site actually serves.
 */
export { slateDateString } from "../src/lib/slate-date.ts";
