"use server";

import { getAuth } from "@/lib/auth";
import { getHomeFollowing, getHomeForYou, postItems } from "@/lib/home-feed";
import { getProfilePosts, type ProfileTab } from "@/lib/social";
import { FeedList } from "@/components/social/feed";
import { loadBoardDays } from "@/app/(site)/picks/board-days";
import { categoryFromParam, tabFromParam } from "@/lib/board";
import { isValidSlateDate } from "@/lib/slate-date";
import type { Chunk } from "@/components/load-more";

/**
 * The next chunk of a list, for infinite scroll (components/load-more.tsx).
 * Each returns the rows rendered by the same components as the first page,
 * plus the cursor after them. Every one re-checks the session: an action is a
 * public endpoint whatever page it was handed to.
 */

const UUID = /^[0-9a-f-]{36}$/i;

async function viewer() {
  const auth = await getAuth();
  if (!auth) throw new Error("Signed out");
  return auth;
}

export async function loadHomeAction(tab: "for-you" | "following", cursor: string): Promise<Chunk> {
  const auth = await viewer();
  if (tab === "following") {
    if (!UUID.test(cursor)) throw new Error("Bad cursor");
    const feed = await getHomeFollowing(auth.user.id, cursor);
    return {
      node: <FeedList items={feed.items} viewerId={auth.user.id} isAdmin={auth.isAdmin} />,
      next: feed.nextCursor,
    };
  }
  const page = Number.parseInt(cursor, 10);
  if (!(page >= 1 && page <= 50)) throw new Error("Bad cursor");
  const feed = await getHomeForYou(auth.user.id, page);
  return {
    node: <FeedList items={feed.items} viewerId={auth.user.id} isAdmin={auth.isAdmin} />,
    next: feed.nextPage !== null && feed.nextPage <= 50 ? String(feed.nextPage) : null,
  };
}

export async function loadProfileAction(profileId: string, tab: ProfileTab, cursor: string): Promise<Chunk> {
  const auth = await viewer();
  if (!UUID.test(profileId) || !UUID.test(cursor) || !["posts", "replies", "likes"].includes(tab)) {
    throw new Error("Bad cursor");
  }
  const feed = await getProfilePosts(profileId, auth.user.id, tab, cursor);
  return {
    node: <FeedList items={await postItems(feed.posts, auth.user.id)} viewerId={auth.user.id} isAdmin={auth.isAdmin} />,
    next: feed.nextCursor,
  };
}

export async function loadBoardAction(tab: string, before: string): Promise<Chunk> {
  const auth = await viewer();
  if (!isValidSlateDate(before)) throw new Error("Bad cursor");
  const { node, next } = await loadBoardDays({
    auth,
    tab: tabFromParam(tab),
    category: categoryFromParam(tab),
    before,
  });
  return { node, next };
}
