import "server-only";
import { randomInt } from "node:crypto";
import { and, desc, asc, eq, isNull, isNotNull, ne, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { linkPreviews, postLikes, posts, userFollows, users } from "@/db/schema";
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
  /** Whether the viewer has liked it. Always false signed out. */
  liked: boolean;
  preview: PostPreview | null;
}

/* ------------------------------------------------------------- the query */

const parentPost = alias(posts, "parent_post");
const parentAuthor = alias(users, "parent_author");

const LIKE_COUNT = sql<number>`(select count(*)::int from ${postLikes} where ${postLikes.postId} = ${posts.id})`;
const REPLY_COUNT = sql<number>`(select count(*)::int from "posts" as "r" where "r"."parent_id" = ${posts.id})`;

function likedBy(viewerId: string | null): SQL<boolean> {
  if (!viewerId) return sql<boolean>`false`;
  return sql<boolean>`exists(select 1 from ${postLikes} where ${postLikes.postId} = ${posts.id} and ${postLikes.userId} = ${viewerId})`;
}

/**
 * Hacker News-style ranking for the For you feed: engagement over age, with
 * gravity 1.5. A reply counts double a like — answering costs more than a tap
 * and says more about whether a post started something — and the +1 lets a
 * brand-new post with nothing yet still outrank a stale one.
 */
const HOT_SCORE = sql<number>`((${LIKE_COUNT}) + 2 * (${REPLY_COUNT}) + 1)
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
      liked: likedBy(viewerId),
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
    liked: Boolean(r.liked),
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
  const rows = await selectPosts(viewerId)
    .where(sql`${posts.createdAt} > now() - interval '30 days'`)
    .orderBy(desc(HOT_SCORE), desc(posts.createdAt))
    .limit(FEED_PAGE_SIZE + 1)
    .offset(pageIndex * FEED_PAGE_SIZE);
  const result = page(rows, FEED_PAGE_SIZE);
  return { ...result, nextPage: result.nextCursor ? pageIndex + 1 : null };
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
export async function getWhoToFollow(viewerId: string | null, limit = 5): Promise<UserListItem[]> {
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
}

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
