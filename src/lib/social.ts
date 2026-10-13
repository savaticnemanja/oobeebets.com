import "server-only";
import { randomInt } from "node:crypto";
import { cache } from "react";
import { and, desc, asc, eq, gte, inArray, isNull, isNotNull, lt, ne, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { linkPreviews, pollOptions, pollVotes, postLikes, postPolls, postReposts, postViews, posts, userFollows, users } from "@/db/schema";
import { getMediaFor, type MediaView } from "@/lib/media";
import { getParlaysByIds, markPlayed, type ParlayView } from "@/lib/parlay-store";
import type { Role } from "@/db/schema";
import { isReservedUsername } from "@/lib/social-rules";

/**
 * Reads for the social layer: feeds, profiles, threads and who-to-follow.
 *
 * Counts are correlated subqueries rather than stored counters. At beta scale
 * a count(*) over an indexed foreign key is microseconds, and a counter column
 * is a second copy of a fact the rows already hold — one more thing that can
 * drift. When the feed gets hot, this is the file where counters go.
 */

export const FEED_PAGE_SIZE = 30;

export interface PostAuthor {
  id: string;
  username: string;
  displayName: string | null;
  role: Role;
}

export interface PostPreview {
  url: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
  cardType: string | null;
}

export interface FeedPost {
  id: string;
  body: string;
  createdAt: Date;
  parentId: string | null;
  author: PostAuthor;
  /** Set on replies: who is being answered, for the "Replying to" line. */
  replyToUsername: string | null;
  likeCount: number;
  replyCount: number;
  repostCount: number;
  /** Unique viewers (see post_views). */
  viewCount: number;
  /** Whether the viewer has liked it. Always false signed out. */
  liked: boolean;
  /** Whether the viewer has reposted it. Always false signed out. */
  reposted: boolean;
  preview: PostPreview | null;
  /** A shared Community parlay: the post carries this ticket (see withAttachments). */
  parlayId: string | null;
  parlay?: ParlayView | null;
  /** Photos or a GIF, in order (see withAttachments). */
  media?: MediaView[];
  poll?: PollView | null;
}

export interface PollView {
  endsAt: Date;
  options: Array<{ id: string; label: string; votes: number }>;
  total: number;
  /** The option the viewer voted for, if they did. */
  myVote: string | null;
}

/* ------------------------------------------------------------- the query */

const parentPost = alias(posts, "parent_post");
const parentAuthor = alias(users, "parent_author");

const LIKE_COUNT = sql<number>`(select count(*)::int from ${postLikes} where ${postLikes.postId} = ${posts.id})`;
const REPLY_COUNT = sql<number>`(select count(*)::int from "posts" as "r" where "r"."parent_id" = ${posts.id})`;

const REPOST_COUNT = sql<number>`(select count(*)::int from ${postReposts} where ${postReposts.postId} = ${posts.id})`;
const VIEW_COUNT = sql<number>`(select count(*)::int from ${postViews} where ${postViews.postId} = ${posts.id})`;

function likedBy(viewerId: string | null): SQL<boolean> {
  if (!viewerId) return sql<boolean>`false`;
  return sql<boolean>`exists(select 1 from ${postLikes} where ${postLikes.postId} = ${posts.id} and ${postLikes.userId} = ${viewerId})`;
}

function repostedBy(viewerId: string | null): SQL<boolean> {
  if (!viewerId) return sql<boolean>`false`;
  return sql<boolean>`exists(select 1 from ${postReposts} where ${postReposts.postId} = ${posts.id} and ${postReposts.userId} = ${viewerId})`;
}

/**
 * Hacker News-style ranking for the For you feed: engagement over age, with
 * gravity 1.5. A reply or a repost counts double a like — each costs more than
 * a tap and says more about whether a post started something — and the +1
 * lets a brand-new post with nothing yet still outrank a stale one.
 */
const HOT_SCORE = sql<number>`((${LIKE_COUNT}) + 2 * (${REPLY_COUNT}) + 2 * (${REPOST_COUNT}) + 1)
  / power(extract(epoch from (now() - ${posts.createdAt})) / 3600 + 2, 1.5)`;

function selectPosts(viewerId: string | null) {
  return db
    .select({
      id: posts.id,
      body: posts.body,
      createdAt: posts.createdAt,
      parentId: posts.parentId,
      authorId: users.id,
      authorUsername: users.username,
      authorDisplayName: users.displayName,
      authorRole: users.role,
      replyToUsername: parentAuthor.username,
      likeCount: LIKE_COUNT,
      replyCount: REPLY_COUNT,
      repostCount: REPOST_COUNT,
      viewCount: VIEW_COUNT,
      liked: likedBy(viewerId),
      reposted: repostedBy(viewerId),
      parlayId: posts.parlayId,
      previewUrl: linkPreviews.url,
      previewTitle: linkPreviews.title,
      previewDescription: linkPreviews.description,
      previewImageUrl: linkPreviews.imageUrl,
      previewSiteName: linkPreviews.siteName,
      previewCardType: linkPreviews.cardType,
    })
    .from(posts)
    .innerJoin(users, eq(users.id, posts.authorId))
    .leftJoin(parentPost, eq(parentPost.id, posts.parentId))
    .leftJoin(parentAuthor, eq(parentAuthor.id, parentPost.authorId))
    .leftJoin(
      linkPreviews,
      and(eq(linkPreviews.url, posts.linkUrl), eq(linkPreviews.status, "ok")),
    )
    .$dynamic();
}

type Row = Awaited<ReturnType<ReturnType<typeof selectPosts>["execute"]>>[number];

function toFeedPost(r: Row): FeedPost {
  return {
    id: r.id,
    body: r.body,
    createdAt: r.createdAt,
    parentId: r.parentId,
    author: {
      id: r.authorId,
      username: r.authorUsername,
      displayName: r.authorDisplayName,
      role: r.authorRole,
    },
    replyToUsername: r.replyToUsername,
    likeCount: Number(r.likeCount),
    replyCount: Number(r.replyCount),
    repostCount: Number(r.repostCount),
    viewCount: Number(r.viewCount),
    liked: Boolean(r.liked),
    reposted: Boolean(r.reposted),
    parlayId: r.parlayId,
    preview: r.previewUrl
      ? {
          url: r.previewUrl,
          title: r.previewTitle,
          description: r.previewDescription,
          imageUrl: r.previewImageUrl,
          siteName: r.previewSiteName,
          cardType: r.previewCardType,
        }
      : null,
  };
}

/**
 * Keyset pagination: everything strictly older than the cursor post. The
 * cursor is a post id rather than a timestamp because Postgres keeps
 * microseconds and a JS Date does not — a timestamp round-tripped through the
 * URL would skip or repeat posts written in the same millisecond.
 */
function olderThan(cursorId: string | undefined): SQL | undefined {
  if (!cursorId) return undefined;
  return sql`(${posts.createdAt}, ${posts.id}) < (select "c"."created_at", "c"."id" from "posts" as "c" where "c"."id" = ${cursorId})`;
}

export interface FeedPage {
  posts: FeedPost[];
  /** Pass back as `before` to get the next page; null on the last one. */
  nextCursor: string | null;
}

function page(rows: Row[], limit: number): FeedPage {
  const list = rows.slice(0, limit).map(toFeedPost);
  return { posts: list, nextCursor: rows.length > limit ? list.at(-1)!.id : null };
}

/* ----------------------------------------------------------------- feeds */

/**
 * Following: posts and replies from the accounts the viewer follows, plus
 * their own, newest first. A reply carries its "Replying to" line and opens
 * its thread, so it reads as a pointer into a conversation, not half of one.
 */
export async function getFollowingFeed(viewerId: string, before?: string): Promise<FeedPage> {
  const rows = await selectPosts(viewerId)
    .where(
      and(
        sql`(${posts.authorId} = ${viewerId} or ${posts.authorId} in (select ${userFollows.followeeId} from ${userFollows} where ${userFollows.followerId} = ${viewerId}))`,
        olderThan(before),
      ),
    )
    .orderBy(desc(posts.createdAt), desc(posts.id))
    .limit(FEED_PAGE_SIZE + 1);
  return page(rows, FEED_PAGE_SIZE);
}

/**
 * For you: the default curation, and the whole feed for anyone who follows
 * nobody yet. Every post and reply from the last 30 days, ranked by HOT_SCORE.
 * Paged by offset rather than cursor, because a ranking that moves while you
 * read has no stable "older than this one".
 */
export async function getForYouFeed(viewerId: string | null, pageIndex = 0): Promise<FeedPage & { nextPage: number | null }> {
  // Shared parlays take turns with these instead of competing on the score —
  // see getRecentParlayPosts and lib/home-feed.ts.
  const rows = await selectPosts(viewerId)
    .where(and(sql`${posts.createdAt} > now() - interval '30 days'`, isNull(posts.parlayId)))
    .orderBy(desc(HOT_SCORE), desc(posts.createdAt))
    .limit(FEED_PAGE_SIZE + 1)
    .offset(pageIndex * FEED_PAGE_SIZE);
  const result = page(rows, FEED_PAGE_SIZE);
  return { ...result, nextPage: result.nextCursor ? pageIndex + 1 : null };
}

/**
 * The posts a page's replies answer, keyed by id, so a timeline can draw each
 * reply under the post it is replying to. One query for the whole page.
 */
export async function getParents(list: FeedPost[], viewerId: string | null): Promise<Map<string, FeedPost>> {
  const ids = [...new Set(list.map((p) => p.parentId).filter((id): id is string => id !== null))];
  if (ids.length === 0) return new Map();
  const rows = await selectPosts(viewerId).where(inArray(posts.id, ids));
  return new Map(rows.map(toFeedPost).map((p) => [p.id, p]));
}

/**
 * Fills in the ticket on every post that carries a shared parlay — one query
 * for the lot, graded the way every other surface grades a parlay. A post
 * whose parlay can't be read (deleted mid-render) keeps parlay = null.
 */
export async function withParlays(list: FeedPost[], viewerId: string | null = null): Promise<FeedPost[]> {
  const ids = [...new Set(list.map((p) => p.parlayId).filter((id): id is string => id !== null))];
  if (ids.length === 0) return list;
  const byId = new Map((await markPlayed(await getParlaysByIds(ids), viewerId)).map((pl) => [pl.id, pl]));
  return list.map((p) => (p.parlayId ? { ...p, parlay: byId.get(p.parlayId) ?? null } : p));
}

/**
 * Everything a post carries besides its text: a parlay's ticket, photos or a
 * GIF, a poll. One query per kind for the whole page.
 */
export async function withAttachments(list: FeedPost[], viewerId: string | null): Promise<FeedPost[]> {
  if (list.length === 0) return list;
  const ids = list.map((p) => p.id);
  const [withTickets, media, polls] = await Promise.all([withParlays(list, viewerId), getMediaFor(ids), getPollsFor(ids, viewerId)]);
  return withTickets.map((p) => ({ ...p, media: media.get(p.id) ?? [], poll: polls.get(p.id) ?? null }));
}

async function getPollsFor(postIds: string[], viewerId: string | null): Promise<Map<string, PollView>> {
  const polls = await db.select().from(postPolls).where(inArray(postPolls.postId, postIds));
  if (polls.length === 0) return new Map();
  const pollIds = polls.map((p) => p.postId);
  const [options, mine] = await Promise.all([
    db
      .select({
        id: pollOptions.id,
        postId: pollOptions.postId,
        label: pollOptions.label,
        votes: sql<number>`(select count(*)::int from ${pollVotes} where ${pollVotes.optionId} = ${pollOptions.id})`,
      })
      .from(pollOptions)
      .where(inArray(pollOptions.postId, pollIds))
      .orderBy(pollOptions.position),
    viewerId
      ? db
          .select({ postId: pollVotes.postId, optionId: pollVotes.optionId })
          .from(pollVotes)
          .where(and(inArray(pollVotes.postId, pollIds), eq(pollVotes.userId, viewerId)))
      : Promise.resolve([] as Array<{ postId: string; optionId: string }>),
  ]);
  const myVote = new Map(mine.map((m) => [m.postId, m.optionId]));
  return new Map(
    polls.map((p) => {
      const opts = options.filter((o) => o.postId === p.postId).map((o) => ({ id: o.id, label: o.label, votes: Number(o.votes) }));
      return [
        p.postId,
        { endsAt: p.endsAt, options: opts, total: opts.reduce((n, o) => n + o.votes, 0), myVote: myVote.get(p.postId) ?? null },
      ];
    }),
  );
}

/** Reposts for a timeline: the post, who reposted it, and when. */
export interface FeedRepost {
  post: FeedPost;
  by: PostAuthor;
  at: Date;
}

const reposter = alias(users, "reposter");

/**
 * Reposts by the accounts a viewer follows (and the viewer's own), between
 * `from` (inclusive) and `to` (exclusive) — the Following feed merges these in
 * by the same time-window trick it uses for nothing else now (see
 * lib/home-feed.ts), so it needs no second cursor.
 */
export async function getFollowingReposts(opts: {
  viewerId: string;
  from: Date | null;
  to: Date | null;
  limit: number;
}): Promise<FeedRepost[]> {
  const rows = await db
    .select({
      postId: postReposts.postId,
      at: postReposts.createdAt,
      byId: reposter.id,
      byUsername: reposter.username,
      byDisplayName: reposter.displayName,
      byRole: reposter.role,
    })
    .from(postReposts)
    .innerJoin(reposter, eq(reposter.id, postReposts.userId))
    .where(
      and(
        sql`(${postReposts.userId} = ${opts.viewerId} or ${postReposts.userId} in (select ${userFollows.followeeId} from ${userFollows} where ${userFollows.followerId} = ${opts.viewerId}))`,
        opts.from ? gte(postReposts.createdAt, opts.from) : undefined,
        opts.to ? lt(postReposts.createdAt, opts.to) : undefined,
      ),
    )
    .orderBy(desc(postReposts.createdAt))
    .limit(opts.limit);
  if (rows.length === 0) return [];
  const postRows = await selectPosts(opts.viewerId).where(inArray(posts.id, [...new Set(rows.map((r) => r.postId))]));
  const byId = new Map(postRows.map(toFeedPost).map((p) => [p.id, p]));
  return rows.flatMap((r) => {
    const post = byId.get(r.postId);
    if (!post) return [];
    return [{ post, at: r.at, by: { id: r.byId, username: r.byUsername, displayName: r.byDisplayName, role: r.byRole } }];
  });
}

/**
 * The newest shared parlays of the last week, as posts — For you drops them
 * in between its ranked posts. A fresh ticket has no engagement to rank on
 * yet, so on the score alone it would never surface.
 */
export async function getRecentParlayPosts(viewerId: string | null, offset: number, limit: number): Promise<FeedPost[]> {
  const rows = await selectPosts(viewerId)
    .where(and(isNotNull(posts.parlayId), sql`${posts.createdAt} > now() - interval '7 days'`))
    .orderBy(desc(posts.createdAt), desc(posts.id))
    .limit(limit)
    .offset(offset);
  return rows.map(toFeedPost);
}

/** The posts that carry these shared parlays, keyed by parlay id — for the Community tab's actions. */
export async function getParlayPosts(parlayIds: string[], viewerId: string | null): Promise<Map<string, FeedPost>> {
  if (parlayIds.length === 0) return new Map();
  const rows = await selectPosts(viewerId).where(inArray(posts.parlayId, parlayIds));
  return new Map(rows.map(toFeedPost).map((p) => [p.parlayId!, p]));
}

export type ProfileTab = "posts" | "replies" | "likes";

export async function getProfilePosts(
  userId: string,
  viewerId: string | null,
  tab: ProfileTab,
  before?: string,
): Promise<FeedPage> {
  if (tab === "likes") {
    // Ordered by when the like happened would be truer, but it needs a
    // second cursor shape; newest-post-first is what a reader expects anyway.
    const rows = await selectPosts(viewerId)
      .where(
        and(
          sql`exists(select 1 from ${postLikes} where ${postLikes.postId} = ${posts.id} and ${postLikes.userId} = ${userId})`,
          olderThan(before),
        ),
      )
      .orderBy(desc(posts.createdAt), desc(posts.id))
      .limit(FEED_PAGE_SIZE + 1);
    return page(rows, FEED_PAGE_SIZE);
  }
  const rows = await selectPosts(viewerId)
    .where(
      and(
        eq(posts.authorId, userId),
        tab === "posts" ? isNull(posts.parentId) : isNotNull(posts.parentId),
        olderThan(before),
      ),
    )
    .orderBy(desc(posts.createdAt), desc(posts.id))
    .limit(FEED_PAGE_SIZE + 1);
  return page(rows, FEED_PAGE_SIZE);
}

/* ---------------------------------------------------------------- thread */

export async function getPost(id: string, viewerId: string | null): Promise<FeedPost | null> {
  const [row] = await selectPosts(viewerId).where(eq(posts.id, id)).limit(1);
  return row ? toFeedPost(row) : null;
}

/** The posts above this one in its thread, root first. Capped, so a very
 * deep thread shows its last few hops rather than its whole history. */
export async function getAncestors(post: FeedPost, viewerId: string | null, max = 8): Promise<FeedPost[]> {
  const chain: FeedPost[] = [];
  let parentId = post.parentId;
  while (parentId && chain.length < max) {
    const parent = await getPost(parentId, viewerId);
    if (!parent) break;
    chain.unshift(parent);
    parentId = parent.parentId;
  }
  return chain;
}

export async function getReplies(postId: string, viewerId: string | null): Promise<FeedPost[]> {
  const rows = await selectPosts(viewerId)
    .where(eq(posts.parentId, postId))
    .orderBy(asc(posts.createdAt), asc(posts.id))
    .limit(200);
  return rows.map(toFeedPost);
}

/* --------------------------------------------------------------- profiles */

export interface Profile {
  id: string;
  username: string;
  displayName: string | null;
  bio: string | null;
  role: Role;
  createdAt: Date;
  followers: number;
  following: number;
  posts: number;
  /** The viewer follows this profile. */
  viewerFollows: boolean;
  /** This profile follows the viewer — the "Follows you" badge. */
  followsViewer: boolean;
}

export async function getProfile(username: string, viewerId: string | null): Promise<Profile | null> {
  const [row] = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      bio: users.bio,
      role: users.role,
      createdAt: users.createdAt,
      followers: sql<number>`(select count(*)::int from ${userFollows} where ${userFollows.followeeId} = ${users.id})`,
      following: sql<number>`(select count(*)::int from ${userFollows} where ${userFollows.followerId} = ${users.id})`,
      posts: sql<number>`(select count(*)::int from ${posts} where ${posts.authorId} = ${users.id} and ${posts.parentId} is null)`,
      viewerFollows: viewerId
        ? sql<boolean>`exists(select 1 from ${userFollows} where ${userFollows.followerId} = ${viewerId} and ${userFollows.followeeId} = ${users.id})`
        : sql<boolean>`false`,
      followsViewer: viewerId
        ? sql<boolean>`exists(select 1 from ${userFollows} where ${userFollows.followerId} = ${users.id} and ${userFollows.followeeId} = ${viewerId})`
        : sql<boolean>`false`,
    })
    .from(users)
    .where(eq(users.username, username.toLowerCase()))
    .limit(1);
  if (!row) return null;
  return {
    ...row,
    followers: Number(row.followers),
    following: Number(row.following),
    posts: Number(row.posts),
    viewerFollows: Boolean(row.viewerFollows),
    followsViewer: Boolean(row.followsViewer),
  };
}

export async function getFollowingCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(userFollows)
    .where(eq(userFollows.followerId, userId));
  return Number(row?.n ?? 0);
}

export interface UserListItem {
  id: string;
  username: string;
  displayName: string | null;
  bio: string | null;
  role: Role;
  viewerFollows: boolean;
  followsViewer: boolean;
}

function userListColumns(viewerId: string | null) {
  return {
    id: users.id,
    username: users.username,
    displayName: users.displayName,
    bio: users.bio,
    role: users.role,
    viewerFollows: viewerId
      ? sql<boolean>`exists(select 1 from ${userFollows} as "vf" where "vf"."follower_id" = ${viewerId} and "vf"."followee_id" = ${users.id})`
      : sql<boolean>`false`,
    followsViewer: viewerId
      ? sql<boolean>`exists(select 1 from ${userFollows} as "fv" where "fv"."follower_id" = ${users.id} and "fv"."followee_id" = ${viewerId})`
      : sql<boolean>`false`,
  };
}

function toListItem(r: UserListItem): UserListItem {
  return { ...r, viewerFollows: Boolean(r.viewerFollows), followsViewer: Boolean(r.followsViewer) };
}

/** Who follows `userId` ("followers") or whom `userId` follows ("following"). */
export async function listConnections(
  userId: string,
  direction: "followers" | "following",
  viewerId: string | null,
): Promise<UserListItem[]> {
  const joinOn =
    direction === "followers"
      ? and(eq(userFollows.followerId, users.id), eq(userFollows.followeeId, userId))
      : and(eq(userFollows.followeeId, users.id), eq(userFollows.followerId, userId));
  const rows = await db
    .select(userListColumns(viewerId))
    .from(users)
    .innerJoin(userFollows, joinOn)
    .orderBy(desc(userFollows.createdAt))
    .limit(500);
  return rows.map(toListItem);
}

/**
 * Accounts worth following, for the side rail and the empty Following tab:
 * everyone the viewer doesn't follow yet, most-followed first, then whoever
 * has been posting. Admins rise to the top — on a beta this small, the house
 * account is the one with something to say on day one.
 */
export const getWhoToFollow = cache(async function getWhoToFollow(
  viewerId: string | null,
  limit = 5,
): Promise<UserListItem[]> {
  const rows = await db
    .select(userListColumns(viewerId))
    .from(users)
    .where(
      viewerId
        ? and(
            ne(users.id, viewerId),
            sql`not exists(select 1 from ${userFollows} where ${userFollows.followerId} = ${viewerId} and ${userFollows.followeeId} = ${users.id})`,
          )
        : undefined,
    )
    .orderBy(
      sql`(${users.role} = 'admin') desc`,
      sql`(select count(*) from ${userFollows} where ${userFollows.followeeId} = ${users.id}) desc`,
      sql`(select max(${posts.createdAt}) from ${posts} where ${posts.authorId} = ${users.id}) desc nulls last`,
      desc(users.createdAt),
    )
    .limit(limit);
  return rows.map(toListItem);
});
// cache(): the shell's side rail and Home's inline "Start here" ask for the
// same list in the same request; this makes that one query.

/* -------------------------------------------------------------- handles */

/**
 * A free handle for a new account, derived from its name or email:
 * "Ben Dutton" → ben_dutton, falling back to ben_dutton4821 when taken.
 * Never throws for a collision — the last resort is a random user_xxxxxx.
 */
export async function mintUsername(...seeds: Array<string | null | undefined>): Promise<string> {
  const bases: string[] = [];
  for (const seed of seeds) {
    if (!seed) continue;
    const local = seed.includes("@") ? seed.split("@")[0] : seed;
    const base = local
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 15);
    if (base.length >= 3 && !isReservedUsername(base)) bases.push(base);
  }

  const candidates = [
    ...bases,
    ...bases.flatMap((b) => [1, 2, 3].map(() => `${b}${randomInt(10, 10000)}`)),
  ];
  for (const candidate of candidates) {
    const [taken] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, candidate))
      .limit(1);
    if (!taken) return candidate;
  }
  return `user_${randomInt(100000, 1000000)}`;
}

/** Whether `username` belongs to someone other than `exceptUserId`. */
export async function usernameTaken(username: string, exceptUserId?: string): Promise<boolean> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      exceptUserId
        ? and(eq(users.username, username), ne(users.id, exceptUserId))
        : eq(users.username, username),
    )
    .limit(1);
  return Boolean(row);
}
