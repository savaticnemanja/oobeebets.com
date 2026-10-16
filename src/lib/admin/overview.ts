import "server-only";
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, ne, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  feedback,
  games,
  invitations,
  oddsSync,
  parlays,
  picks,
  reports,
  slates,
  users,
  waitlist,
} from "@/db/schema";
import { FEED_LEAGUES } from "@/lib/odds/markets";
import { pickProfit } from "@/lib/settlement";
import { SLATE_DAY_BOUNDARY_HOUR, SLATE_TIMEZONE, addDays } from "@/lib/slate-date";
import { slateBounds } from "@/lib/odds/sync";
import { pickCategories, type PickCategory } from "@/lib/board";

/**
 * What the admin overview reads. Every figure is a count off rows the app
 * already writes — nothing here is tracked for the dashboard's sake.
 *
 * "Activity" is anything an account did: a post or reply, a like, a repost,
 * a bet taken, a parlay played, a follow, a post read (post_views), or a
 * session seen (sessions.last_seen_at, which is written about once a day).
 * Days are slate days — the 04:00 ET boundary the board uses — so "today"
 * here is the board's today.
 */

// Inlined rather than bound: Postgres only matches a GROUP BY expression to the
// select list when the two are textually identical, and two bind parameters
// never are. Checked, since it comes from the environment.
const ZONE = /^[A-Za-z0-9_+\-/]+$/.test(SLATE_TIMEZONE) ? SLATE_TIMEZONE : "America/New_York";

/** An instant's slate day, in SQL — the same rule as slateDateString(). */
function slateDay(col: SQL): SQL {
  return sql`((${col} at time zone '${sql.raw(ZONE)}') - interval '${sql.raw(String(SLATE_DAY_BOUNDARY_HOUR))} hours')::date`;
}

/** Every account action since `from`, as (user_id, at, kind). */
function events(from: Date): SQL {
  // As text: postgres-js won't take a Date inside a raw sql`` fragment.
  const at = sql`${from.toISOString()}::timestamptz`;
  return sql`
    select author_id as user_id, created_at as at, 'post' as kind from posts where created_at >= ${at}
    union all select user_id, created_at, 'like' from post_likes where created_at >= ${at}
    union all select user_id, created_at, 'repost' from post_reposts where created_at >= ${at}
    union all select user_id, created_at, 'take' from pick_follows where created_at >= ${at}
    union all select user_id, created_at, 'play' from parlay_follows where created_at >= ${at}
    union all select follower_id, created_at, 'follow' from user_follows where created_at >= ${at}
    union all select user_id, created_at, 'view' from post_views where created_at >= ${at}
    union all select user_id, last_seen_at, 'seen' from sessions where last_seen_at >= ${at}
    union all select user_id, created_at, 'seen' from sessions where created_at >= ${at}
  `;
}

export interface DayPoint {
  day: string;
  active: number;
  posts: number;
  bets: number;
  joined: number;
}

export interface Pulse {
  series: DayPoint[];
  /** Distinct accounts active in the last 7 slate days, and the 7 before. */
  active: { now: number; before: number };
  joined: { now: number; before: number };
  posts: { now: number; before: number };
  bets: { now: number; before: number };
  accounts: { total: number; admins: number };
}

/** The last `days` slate days of activity, today last. */
export async function getPulse(today: string, days = 30): Promise<Pulse> {
  const start = addDays(today, -(days - 1));
  // A day of slack either side of the boundary; the day buckets do the cutting.
  const from = new Date(slateBounds(start).from.getTime() - 24 * 3600_000);
  const ev = events(from);

  const [series, [win], [acc]] = await Promise.all([
    db.execute<DayPoint & Record<string, unknown>>(sql`
      with ev as (${ev})
      select d::date::text as day,
        coalesce(a.active, 0)::int as active,
        coalesce(a.posts, 0)::int as posts,
        coalesce(a.bets, 0)::int as bets,
        coalesce(u.joined, 0)::int as joined
      from generate_series(${start}::date, ${today}::date, interval '1 day') d
      left join (
        select ${slateDay(sql`at`)} as day,
          count(distinct user_id) as active,
          count(*) filter (where kind = 'post') as posts,
          count(*) filter (where kind in ('take', 'play')) as bets
        from ev group by 1
      ) a on a.day = d::date
      left join (
        select ${slateDay(sql`created_at`)} as day, count(*) as joined
        from users where created_at >= ${from.toISOString()}::timestamptz group by 1
      ) u on u.day = d::date
      order by d
    `),
    db.execute<{ now: number; before: number } & Record<string, unknown>>(sql`
      with ev as (${ev})
      select
        count(distinct user_id) filter (where ${slateDay(sql`at`)} > ${today}::date - 7)::int as now,
        count(distinct user_id) filter (
          where ${slateDay(sql`at`)} <= ${today}::date - 7 and ${slateDay(sql`at`)} > ${today}::date - 14
        )::int as before
      from ev
    `),
    db.execute<{ total: number; admins: number } & Record<string, unknown>>(sql`
      select count(*)::int as total, count(*) filter (where role = 'admin')::int as admins from ${users}
    `),
  ]);

  const points = (series as unknown as DayPoint[]).map((p) => ({ ...p }));
  const sum = (key: keyof Omit<DayPoint, "day">, from: number, to: number) =>
    points.slice(Math.max(0, points.length - to), points.length - from).reduce((n, p) => n + p[key], 0);

  return {
    series: points,
    active: { now: win.now, before: win.before },
    joined: { now: sum("joined", 0, 7), before: sum("joined", 7, 14) },
    posts: { now: sum("posts", 0, 7), before: sum("posts", 7, 14) },
    bets: { now: sum("bets", 0, 7), before: sum("bets", 7, 14) },
    accounts: { total: acc.total, admins: acc.admins },
  };
}

export interface MemberRow {
  id: string;
  username: string;
  displayName: string | null;
  avatarId: string | null;
  role: "user" | "admin";
  posts: number;
  bets: number;
  reactions: number;
  actions: number;
  last: string;
}

/** Who did the most in the last 7 slate days — posts, bets, likes, follows. */
export async function getTopMembers(today: string, limit = 5): Promise<MemberRow[]> {
  const from = new Date(slateBounds(addDays(today, -7)).from.getTime());
  const rows = await db.execute<Record<string, unknown>>(sql`
    with ev as (${events(from)})
    select u.id, u.username, u.display_name, u.avatar_id, u.role,
      count(*) filter (where kind = 'post')::int as posts,
      count(*) filter (where kind in ('take', 'play'))::int as bets,
      count(*) filter (where kind in ('like', 'repost', 'follow'))::int as reactions,
      count(*) filter (where kind not in ('seen', 'view'))::int as actions,
      max(at)::text as last
    from ev join ${users} u on u.id = ev.user_id
    where ${slateDay(sql`at`)} > ${today}::date - 7
    group by u.id
    having count(*) filter (where kind not in ('seen', 'view')) > 0
    order by actions desc, last desc
    limit ${limit}
  `);
  return (rows as unknown as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    username: r.username as string,
    displayName: (r.display_name as string | null) ?? null,
    avatarId: (r.avatar_id as string | null) ?? null,
    role: r.role as "user" | "admin",
    posts: r.posts as number,
    bets: r.bets as number,
    reactions: r.reactions as number,
    actions: r.actions as number,
    last: r.last as string,
  }));
}

export async function getNewestAccounts(limit = 5) {
  return db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      email: users.email,
      avatarId: users.avatarId,
      role: users.role,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt))
    .limit(limit);
}

export interface RecordDay {
  day: string;
  wins: number;
  losses: number;
  pushes: number;
  net: number;
}

/** The published record day by day: the last `limit` slate days with a result. */
export async function getRecordByDay(limit = 12): Promise<RecordDay[]> {
  const rows = await db
    .select({ day: picks.slateDate, price: picks.price, units: picks.units, status: picks.status })
    .from(picks)
    .innerJoin(slates, and(eq(slates.date, picks.slateDate), isNotNull(slates.publishedAt)))
    .where(and(ne(picks.status, "pending"), ne(picks.status, "void")))
    .orderBy(desc(picks.slateDate));

  const byDay = new Map<string, RecordDay>();
  for (const r of rows) {
    let d = byDay.get(r.day);
    if (!d) {
      if (byDay.size >= limit) continue;
      byDay.set(r.day, (d = { day: r.day, wins: 0, losses: 0, pushes: 0, net: 0 }));
    }
    if (r.status === "won") d.wins++;
    else if (r.status === "lost") d.losses++;
    else if (r.status === "push") d.pushes++;
    d.net += pickProfit(r);
  }
  return [...byDay.values()].reverse();
}

export interface SlateSummary {
  day: string;
  published: boolean;
  publishedAt: Date | null;
  counts: Record<PickCategory, number>;
  parlays: number;
  featured: number;
  games: number;
  firstKickoff: Date | null;
}

/** One slate day at a glance: what's on it, and the games it can draw from. */
export async function getSlateSummary(day: string): Promise<SlateSummary> {
  const { from, to } = slateBounds(day);
  const [[slate], counts, [{ n: parlayCount }], [g]] = await Promise.all([
    db.select().from(slates).where(eq(slates.date, day)).limit(1),
    db
      .select({
        category: picks.category,
        n: sql<number>`count(*)::int`,
        featured: sql<number>`count(*) filter (where ${picks.featured})::int`,
      })
      .from(picks)
      .where(eq(picks.slateDate, day))
      .groupBy(picks.category),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(parlays)
      .where(and(eq(parlays.slateDate, day), isNull(parlays.ownerId))),
    db
      .select({ n: sql<number>`count(*)::int`, first: sql<Date | null>`min(${games.commenceTime})` })
      .from(games)
      .where(and(gte(games.commenceTime, from), lt(games.commenceTime, to), inArray(games.league, [...FEED_LEAGUES]))),
  ]);
  const by = Object.fromEntries(
    pickCategories.map((c) => [c, counts.find((r) => r.category === c)?.n ?? 0]),
  ) as Record<PickCategory, number>;
  return {
    day,
    published: Boolean(slate?.publishedAt),
    publishedAt: slate?.publishedAt ?? null,
    counts: by,
    parlays: parlayCount,
    featured: counts.reduce((n, r) => n + r.featured, 0),
    games: g?.n ?? 0,
    firstKickoff: g?.first ? new Date(g.first) : null,
  };
}

export interface Queues {
  dueToSettle: number;
  oldestDue: Date | null;
  openReports: number;
  openFeedback: number;
  waiting: number;
  pendingInvites: number;
}

/** Everything that waits on an admin, counted. */
export async function getQueues(): Promise<Queues> {
  const [[due], [{ n: openReports }], [{ n: openFeedback }], [{ n: waiting }], [{ n: pendingInvites }]] =
    await Promise.all([
      db
        .select({ n: sql<number>`count(*)::int`, oldest: sql<Date | null>`min(${picks.startsAt})` })
        .from(picks)
        .where(and(eq(picks.status, "pending"), sql`${picks.startsAt} < now()`)),
      db.select({ n: sql<number>`count(*)::int` }).from(reports).where(isNull(reports.resolvedAt)),
      db.select({ n: sql<number>`count(*)::int` }).from(feedback).where(isNull(feedback.resolvedAt)),
      db.select({ n: sql<number>`count(*)::int` }).from(waitlist).where(isNull(waitlist.invitedAt)),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(invitations)
        .where(and(eq(invitations.status, "pending"), sql`${invitations.expiresAt} > now()`)),
    ]);
  return {
    dueToSettle: due.n,
    oldestDue: due.oldest ? new Date(due.oldest) : null,
    openReports,
    openFeedback,
    waiting,
    pendingInvites,
  };
}

export interface FeedHealth {
  odds: { last: Date | null; scores: Date | null; error: string | null; credits: number | null };
  stats: { last: Date | null; error: string | null };
}

/** When each feed last ran and whether it failed — read off odds_sync. */
export async function getFeedHealth(): Promise<FeedHealth> {
  const rows = await db.select().from(oddsSync).orderBy(asc(oddsSync.syncedAt));
  const latest = (prefixes: string[]) =>
    rows.filter((r) => prefixes.some((p) => r.key.startsWith(p))).at(-1) ?? null;
  const lastError = (prefixes: string[]) =>
    rows.filter((r) => r.lastError && prefixes.some((p) => r.key.startsWith(p))).at(-1)?.lastError ?? null;
  return {
    odds: {
      last: latest(["odds:"])?.syncedAt ?? null,
      scores: latest(["scores:"])?.syncedAt ?? null,
      error: lastError(["odds:", "scores:", "props:"]),
      credits: rows.find((r) => r.key === "quota")?.creditsRemaining ?? null,
    },
    stats: {
      last: latest(["stats:"])?.syncedAt ?? null,
      error: lastError(["stats:", "gamelog:"]),
    },
  };
}

/** Community-parlay legs that need a result typed by hand — see getPendingCommunityLegs. */
export async function countPendingCommunityLegs(): Promise<number> {
  const [row] = await db.execute<{ n: number } & Record<string, unknown>>(sql`
    select count(*)::int as n
    from selections s join games g on g.id = s.game_id
    where s.status = 'pending' and g.commence_time < now()
      and not exists (select 1 from picks p where p.selection_id = s.id)
      and exists (select 1 from parlay_selection_legs l where l.selection_id = s.id)
  `);
  return row?.n ?? 0;
}

/** The sidebar's counts: one cheap query each. */
export async function getBadgeCounts() {
  const [q, legs] = await Promise.all([getQueues(), countPendingCommunityLegs()]);
  return {
    settle: q.dueToSettle + legs,
    reports: q.openReports,
    feedback: q.openFeedback,
    waitlist: q.waiting,
  };
}

export interface SlateDay {
  day: string;
  games: number;
  firstKickoff: Date | null;
  published: boolean;
  picks: number;
  parlays: number;
}

/**
 * Every day from `from` to `to` (inclusive) that has a game on file or a
 * slate row — the builder's day strip. Days with neither are left out: on a
 * one-sport board most days are empty, and a strip of blanks hides the ones
 * that matter.
 */
export async function getSlateDays(from: string, to: string): Promise<SlateDay[]> {
  const start = slateBounds(from).from;
  const end = slateBounds(to).to;
  const leagues = sql.join(FEED_LEAGUES.map((l) => sql`${l}`), sql`, `);
  const rows = await db.execute<Record<string, unknown>>(sql`
    with g as (
      select ${slateDay(sql`commence_time`)} as day, count(*)::int as games, min(commence_time) as first
      from ${games}
      where commence_time >= ${start.toISOString()}::timestamptz and commence_time < ${end.toISOString()}::timestamptz
        and league in (${leagues})
      group by 1
    ),
    s as (
      select date as day, published_at is not null as published,
        (select count(*)::int from ${picks} p where p.slate_date = sl.date) as picks,
        (select count(*)::int from ${parlays} x where x.slate_date = sl.date and x.owner_id is null) as parlays
      from ${slates} sl
      where date between ${from}::date and ${to}::date
    )
    select coalesce(g.day, s.day)::text as day, coalesce(g.games, 0) as games, g.first,
      coalesce(s.published, false) as published, coalesce(s.picks, 0) as picks, coalesce(s.parlays, 0) as parlays
    from g full join s on s.day = g.day
    where g.day is not null or s.published or s.picks > 0 or s.parlays > 0
    order by 1
  `);
  return (rows as unknown as Record<string, unknown>[]).map((r) => ({
    day: r.day as string,
    games: Number(r.games),
    firstKickoff: r.first ? new Date(r.first as string) : null,
    published: Boolean(r.published),
    picks: Number(r.picks),
    parlays: Number(r.parlays),
  }));
}
