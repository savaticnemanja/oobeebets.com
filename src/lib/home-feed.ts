import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { posts } from "@/db/schema";
import {
  getFollowingFeed,
  getFollowingReposts,
  getForYouFeed,
  getParents,
  getRecentParlayPosts,
  withAttachments,
  type FeedPost,
  type PostAuthor,
} from "@/lib/social";

/**
 * Timeline items for Home and profiles. Everything is a post now — a shared
 * Community parlay is carried by one (posts.parlay_id) — so the only extra
 * shapes are a reply's parent drawn above it, and a repost's "X reposted".
 */

export interface FeedItem {
  /** Unique per row: a post can appear once as itself and once as a repost. */
  key: string;
  post: FeedPost;
  /** Set on a reply: the post it answers, drawn above it. */
  parent?: FeedPost;
  /** Set when this row is someone's repost of the post. */
  repostedBy?: PostAuthor;
}

/** Posts as timeline items: tickets filled in, each reply carrying its parent. */
export async function postItems(list: FeedPost[], viewerId: string | null): Promise<FeedItem[]> {
  const [full, parents] = await Promise.all([withAttachments(list, viewerId), getParents(list, viewerId)]);
  const fullParents = new Map((await withAttachments([...parents.values()], viewerId)).map((p) => [p.id, p]));
  return full.map((post) => ({
    key: post.id,
    post,
    parent: post.parentId ? fullParents.get(post.parentId) : undefined,
  }));
}

/**
 * Following, newest first: posts by the accounts you follow, and their
 * reposts at the time they reposted. The posts query pages by cursor; the
 * reposts on a page are whichever happened inside the stretch of time that
 * page's posts cover — from its oldest post up to where the previous page
 * stopped. Consecutive pages share those bounds, so a repost is neither
 * skipped nor shown twice, and no second cursor is needed.
 */
export async function getHomeFollowing(
  viewerId: string,
  before?: string,
): Promise<{ items: FeedItem[]; nextCursor: string | null }> {
  const [feed, upper] = await Promise.all([
    getFollowingFeed(viewerId, before),
    before
      ? db.select({ at: posts.createdAt }).from(posts).where(eq(posts.id, before)).limit(1)
      : Promise.resolve([]),
  ]);
  const lower = feed.nextCursor ? feed.posts.at(-1)!.createdAt : null;
  const reposts = await getFollowingReposts({ viewerId, from: lower, to: upper[0]?.at ?? null, limit: 50 });

  const own = await postItems(feed.posts, viewerId);
  const shared = await postItems(
    reposts.map((r) => r.post),
    viewerId,
  );
  const timed = [
    ...own.map((item) => ({ item, at: item.post.createdAt.getTime() })),
    ...shared.map((item, i) => ({
      item: { ...item, key: `repost:${reposts[i].by.id}:${item.post.id}`, repostedBy: reposts[i].by },
      at: reposts[i].at.getTime(),
    })),
  ].sort((a, b) => b.at - a.at);

  // A post reposted by several people you follow, or posted and reposted in
  // the same stretch, shows once — its newest appearance.
  const seen = new Set<string>();
  const items = timed
    .map((t) => t.item)
    .filter((item) => (seen.has(item.post.id) ? false : (seen.add(item.post.id), true)));
  return { items, nextCursor: feed.nextCursor };
}

/** How many shared parlays a For you page carries, and how often one appears. */
const PARLAYS_PER_PAGE = 6;
const POSTS_BETWEEN_PARLAYS = 5;

/**
 * For you: the ranked posts, with the newest shared parlays of the last week
 * dropped in every few posts. A fresh ticket has nothing to rank on yet, so
 * rather than compete on the score it takes turns with the posts, newest
 * first, paged by the same page number.
 */
export async function getHomeForYou(
  viewerId: string,
  pageIndex = 0,
): Promise<{ items: FeedItem[]; nextPage: number | null }> {
  const [feed, parlayPosts] = await Promise.all([
    getForYouFeed(viewerId, pageIndex),
    getRecentParlayPosts(viewerId, pageIndex * PARLAYS_PER_PAGE, PARLAYS_PER_PAGE + 1),
  ]);
  const extra = await postItems(parlayPosts.slice(0, PARLAYS_PER_PAGE), viewerId);

  const items: FeedItem[] = [];
  (await postItems(feed.posts, viewerId)).forEach((item, i) => {
    items.push(item);
    if ((i + 1) % POSTS_BETWEEN_PARLAYS === 0 && extra.length > 0) items.push(extra.shift()!);
  });
  items.push(...extra);

  const moreParlays = parlayPosts.length > PARLAYS_PER_PAGE;
  return { items, nextPage: feed.nextPage ?? (moreParlays ? pageIndex + 1 : null) };
}
