import "server-only";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { feedback, invitations, reports, sessions, subscriptions, users } from "@/db/schema";
import type { Role } from "@/db/schema";
import { LIVE_STATUSES } from "@/lib/billing/access";
import { TIERS, TIER_ORDER } from "@/lib/tiers";
import type { UserFilter, UserSort } from "@/lib/admin/directory";

/** One row of the users directory. */
export interface DirectoryRow {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  avatarId: string | null;
  role: Role;
  createdAt: Date;
  /** The later of their last sign-in and the last time a session was seen. */
  lastActive: Date | null;
  takes: number;
  plays: number;
  posts: number;
  parlays: number;
  followers: number;
  /** "Pro", "Base · past due"; null on the free board. */
  plan: string | null;
  suspended: boolean;
}


export interface DirectoryPage {
  rows: DirectoryRow[];
  /** Matching the search and the filter: what the pages count through. */
  total: number;
  /** Per filter, matching the search — the numbers on the filter buttons. */
  counts: Record<UserFilter, number>;
}

/** Never posted, took a bet, played or built a parlay. Over `u`. */
const QUIET = sql`(
  not exists (select 1 from pick_follows x where x.user_id = u.id)
  and not exists (select 1 from parlay_follows x where x.user_id = u.id)
  and not exists (select 1 from posts x where x.author_id = u.id)
  and not exists (select 1 from parlays x where x.owner_id = u.id)
)`;

const LAST_ACTIVE = sql`greatest(u.last_login_at, (select max(s.last_seen_at) from sessions s where s.user_id = u.id))`;
const TAKES = sql`(select count(*)::int from pick_follows f where f.user_id = u.id)`;
const PLAYS = sql`(select count(*)::int from parlay_follows f where f.user_id = u.id)`;
const POSTS = sql`(select count(*)::int from posts p where p.author_id = u.id)`;

/**
 * One page of the directory, searched, filtered and sorted in Postgres. The
 * per-account counts are worked out for the page's rows only, unless the sort
 * needs them for every row.
 */
export async function listUsers({
  q = "",
  filter = "all",
  sort = "newest",
  page = 1,
  size = 50,
}: {
  q?: string;
  filter?: UserFilter;
  sort?: UserSort;
  page?: number;
  size?: number;
} = {}): Promise<DirectoryPage> {
  const needle = q.trim().replace(/^@/, "").toLowerCase();
  // LIKE's own wildcards in what was typed are literal.
  const like = `%${needle.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const search = needle
    ? sql`(lower(u.email) like ${like} or u.username like ${like} or lower(coalesce(u.display_name, '')) like ${like})`
    : sql`true`;
  const where =
    filter === "user" ? sql`u.role = 'user'` : filter === "admin" ? sql`u.role = 'admin'` : filter === "quiet" ? QUIET : sql`true`;
  const order =
    sort === "active"
      ? sql`${LAST_ACTIVE} desc nulls last, u.created_at desc`
      : sort === "bets"
        ? sql`${TAKES} + ${PLAYS} desc, u.created_at desc`
        : sort === "posts"
          ? sql`${POSTS} desc, u.created_at desc`
          : sql`u.created_at desc`;

  const [rows, [c]] = await Promise.all([
    db.execute<Record<string, unknown>>(sql`
      select u.id, u.email, u.username, u.display_name, u.avatar_id, u.role, u.created_at,
        u.suspended_at is not null as suspended,
        ${LAST_ACTIVE} as last_active,
        ${TAKES} as takes,
        ${PLAYS} as plays,
        ${POSTS} as posts,
        (select count(*)::int from parlays p where p.owner_id = u.id) as parlays,
        (select count(*)::int from user_follows f where f.followee_id = u.id) as followers
      from ${users} u
      where ${search} and ${where}
      order by ${order}
      limit ${size} offset ${(Math.max(1, page) - 1) * size}
    `),
    db.execute<Record<string, number>>(sql`
      select count(*)::int as n_all,
        count(*) filter (where u.role = 'user')::int as n_user,
        count(*) filter (where u.role = 'admin')::int as n_admin,
        count(*) filter (where ${QUIET})::int as n_quiet
      from ${users} u where ${search}
    `),
  ]);
  const list = rows as unknown as Record<string, unknown>[];
  const plans = await livePlans(list.map((r) => r.id as string));
  // `all` and `user` are SQL keywords, hence the n_ aliases.
  const counts = { all: c.n_all, user: c.n_user, admin: c.n_admin, quiet: c.n_quiet };
  return {
    total: counts[filter],
    counts,
    rows: list.map((r) => ({
      id: r.id as string,
      email: r.email as string,
      username: r.username as string,
      displayName: (r.display_name as string | null) ?? null,
      avatarId: (r.avatar_id as string | null) ?? null,
      role: r.role as Role,
      createdAt: new Date(r.created_at as string),
      lastActive: r.last_active ? new Date(r.last_active as string) : null,
      takes: Number(r.takes),
      plays: Number(r.plays),
      posts: Number(r.posts),
      parlays: Number(r.parlays),
      followers: Number(r.followers),
      plan: plans.get(r.id as string) ?? null,
      suspended: Boolean(r.suspended),
    })),
  };
}

/** Each account's best live plan, as a label. */
async function livePlans(userIds?: string[]): Promise<Map<string, string>> {
  if (userIds && userIds.length === 0) return new Map();
  const live = await db
    .select({ userId: subscriptions.userId, tier: subscriptions.tier, status: subscriptions.status })
    .from(subscriptions)
    .where(
      userIds
        ? and(inArray(subscriptions.status, LIVE_STATUSES), inArray(subscriptions.userId, userIds))
        : inArray(subscriptions.status, LIVE_STATUSES),
    );
  const best = new Map<string, (typeof live)[number]>();
  for (const s of live) {
    const had = best.get(s.userId);
    if (!had || TIER_ORDER.indexOf(s.tier) > TIER_ORDER.indexOf(had.tier)) best.set(s.userId, s);
  }
  return new Map(
    [...best].map(([id, s]) => [id, `${TIERS[s.tier].name}${s.status === "past_due" ? " · past due" : ""}`]),
  );
}

export interface UserDetail {
  user: typeof users.$inferSelect;
  plan: string | null;
  counts: {
    posts: number;
    replies: number;
    likes: number;
    followers: number;
    following: number;
    takes: number;
    plays: number;
    parlays: number;
    shared: number;
  };
  sessions: { id: string; userAgent: string | null; createdAt: Date; lastSeenAt: Date }[];
  invitedBy: { email: string | null; selfServe: boolean; at: Date } | null;
  reportsAgainst: { open: number; total: number };
  reportsFiled: number;
  feedback: { id: string; kind: string; body: string; createdAt: Date; resolvedAt: Date | null }[];
}

export async function getUserDetail(id: string): Promise<UserDetail | null> {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!user) return null;

  const [[c], sess, [invite], [against], [{ n: filed }], fb, plans] = await Promise.all([
    db.execute<Record<string, number>>(sql`
      select
        (select count(*)::int from posts where author_id = ${id} and parent_id is null) as posts,
        (select count(*)::int from posts where author_id = ${id} and parent_id is not null) as replies,
        (select count(*)::int from post_likes where user_id = ${id}) as likes,
        (select count(*)::int from user_follows where followee_id = ${id}) as followers,
        (select count(*)::int from user_follows where follower_id = ${id}) as following,
        (select count(*)::int from pick_follows where user_id = ${id}) as takes,
        (select count(*)::int from parlay_follows where user_id = ${id}) as plays,
        (select count(*)::int from parlays where owner_id = ${id}) as parlays,
        (select count(*)::int from parlays where owner_id = ${id} and shared) as shared
    `),
    db
      .select({ id: sessions.id, userAgent: sessions.userAgent, createdAt: sessions.createdAt, lastSeenAt: sessions.lastSeenAt })
      .from(sessions)
      .where(and(eq(sessions.userId, id), sql`${sessions.expiresAt} > now()`))
      .orderBy(desc(sessions.lastSeenAt))
      .limit(10),
    db
      .select({ invitedBy: invitations.invitedBy, at: invitations.createdAt, inviter: users.email })
      .from(invitations)
      .leftJoin(users, eq(users.id, invitations.invitedBy))
      .where(eq(invitations.acceptedUserId, id))
      .limit(1),
    db
      .select({
        open: sql<number>`count(*) filter (where ${reports.resolvedAt} is null)::int`,
        total: sql<number>`count(*)::int`,
      })
      .from(reports)
      .where(eq(reports.targetUserId, id)),
    db.select({ n: sql<number>`count(*)::int` }).from(reports).where(eq(reports.reporterId, id)),
    db
      .select({ id: feedback.id, kind: feedback.kind, body: feedback.body, createdAt: feedback.createdAt, resolvedAt: feedback.resolvedAt })
      .from(feedback)
      .where(eq(feedback.userId, id))
      .orderBy(desc(isNull(feedback.resolvedAt)), desc(feedback.createdAt))
      .limit(5),
    livePlans([id]),
  ]);

  return {
    user,
    plan: plans.get(id) ?? null,
    counts: {
      posts: c.posts,
      replies: c.replies,
      likes: c.likes,
      followers: c.followers,
      following: c.following,
      takes: c.takes,
      plays: c.plays,
      parlays: c.parlays,
      shared: c.shared,
    },
    sessions: sess,
    invitedBy: invite ? { email: invite.inviter, selfServe: invite.invitedBy === null, at: invite.at } : null,
    reportsAgainst: against,
    reportsFiled: filed,
    feedback: fb,
  };
}

/** "Chrome on macOS" from a user-agent string — enough to tell devices apart. */
export function deviceLabel(ua: string | null): string {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /CriOS|Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Browser";
  const os = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Mac OS X|Macintosh/.test(ua)
          ? "macOS"
          : /Windows/.test(ua)
            ? "Windows"
            : /Linux/.test(ua)
              ? "Linux"
              : "";
  return os ? `${browser} on ${os}` : browser;
}
