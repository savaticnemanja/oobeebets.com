import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { posts } from "@/db/schema";
import { getFollowingFeed, getForYouFeed, type FeedPost, type PostAuthor } from "@/lib/social";
import { getFeedParlays, type ParlayView } from "@/lib/parlay-store";

/**
 * Home is posts and shared Community parlays in one timeline. The two live in
 * different tables with different shapes, so they meet here, after each has
 * been read and graded the way every other surface reads it.
 */

export type FeedItem =
  | { kind: "post"; post: FeedPost }
  | { kind: "parlay"; parlay: ParlayView; owner: PostAuthor };

export const postItems = (list: FeedPost[]): FeedItem[] =>
  list.map((post) => ({ kind: "post", post }));

function parlayItem({ parlay, ownerRole }: Awaited<ReturnType<typeof getFeedParlays>>[number]): FeedItem {
  return {
    kind: "parlay",
    parlay,
    owner: {
      id: parlay.ownerId!,
      username: parlay.ownerUsername!,
      displayName: parlay.ownerDisplayName,
      role: ownerRole,
    },
  };
}

const at = (i: FeedItem) => (i.kind === "post" ? i.post.createdAt : i.parlay.createdAt).getTime();

/**
 * Following, newest first. The posts query pages by cursor as before; the
 * parlays on a page are whichever were shared inside the stretch of time that
 * page's posts cover — from its oldest post up to where the previous page
 * stopped. Consecutive pages share those bounds, so a parlay can be neither
 * skipped nor shown twice, and no second cursor is needed. The last page has
 * no lower bound and sweeps up anything older.
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
  const parlays = await getFeedParlays({
    followingOf: viewerId,
    from: lower,
    to: upper[0]?.at ?? null,
    limit: 50,
  });

  const items = [...postItems(feed.posts), ...parlays.map(parlayItem)].sort((a, b) => at(b) - at(a));
  return { items, nextCursor: feed.nextCursor };
}

/** How many parlays a For you page carries, and how often one appears. */
const PARLAYS_PER_PAGE = 6;
const POSTS_BETWEEN_PARLAYS = 5;

/**
 * For you: the ranked posts, with the newest shared parlays of the last week
 * dropped in every few posts. Parlays have no likes or replies to rank by, so
 * they don't compete with posts on HOT_SCORE; they take turns with them
 * instead, newest first, paged by the same page number.
 */
export async function getHomeForYou(
  viewerId: string,
  pageIndex = 0,
): Promise<{ items: FeedItem[]; nextPage: number | null }> {
  const [feed, parlays] = await Promise.all([
    getForYouFeed(viewerId, pageIndex),
    getFeedParlays({
      from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      limit: PARLAYS_PER_PAGE + 1,
      offset: pageIndex * PARLAYS_PER_PAGE,
    }),
  ]);
  const extra = parlays.slice(0, PARLAYS_PER_PAGE).map(parlayItem);

  const items: FeedItem[] = [];
  feed.posts.forEach((post, i) => {
    items.push({ kind: "post", post });
    if ((i + 1) % POSTS_BETWEEN_PARLAYS === 0 && extra.length > 0) items.push(extra.shift()!);
  });
  items.push(...extra);

  const moreParlays = parlays.length > PARLAYS_PER_PAGE;
  return { items, nextPage: feed.nextPage ?? (moreParlays ? pageIndex + 1 : null) };
}
