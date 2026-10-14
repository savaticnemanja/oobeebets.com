"use server";

import { getAuth } from "@/lib/auth";
import { forYouCursor, getHomeFollowing, getHomeForYou, parseForYouCursor, postItems } from "@/lib/home-feed";
import { getProfilePosts, type ProfileTab } from "@/lib/social";
import { FeedList } from "@/components/social/feed";
import { loadBoardDays } from "@/app/(site)/picks/board-days";
import { loadCommunityChunk } from "@/app/(site)/community/community-feed";
import { categoryFromParam, sportFilterFromParam, tabFromParam } from "@/lib/board";
import { isValidSlateDate } from "@/lib/slate-date";
import type { Chunk } from "@/components/load-more";
import { GridRows } from "@/components/players/stats-grid";
import { getSeasons } from "@/lib/players/queries";
import { leagueFromParam } from "@/lib/players/catalog";
import { resolveView, tableRows, type PlayersParams } from "@/app/(site)/players/view";

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
  const at = parseForYouCursor(cursor);
  if (!at) throw new Error("Bad cursor");
  const feed = await getHomeForYou(auth.user.id, at.page, at.asOf);
  return {
    node: <FeedList items={feed.items} viewerId={auth.user.id} isAdmin={auth.isAdmin} />,
    next: feed.nextPage !== null && feed.nextPage <= 50 ? forYouCursor(feed.nextPage, feed.asOf) : null,
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

export async function loadBoardAction(tab: string, sport: string, before: string): Promise<Chunk> {
  const auth = await viewer();
  const boardTab = tabFromParam(tab);
  if (!isValidSlateDate(before) || boardTab === "community") throw new Error("Bad cursor");
  const { node, next } = await loadBoardDays({
    auth,
    tab: boardTab,
    category: categoryFromParam(tab),
    sportFilter: sportFilterFromParam(sport),
    before,
  });
  return { node, next };
}

export async function loadCommunityAction(sport: string, before: string): Promise<Chunk> {
  const auth = await viewer();
  if (!UUID.test(before)) throw new Error("Bad cursor");
  return loadCommunityChunk({ auth, sportFilter: sportFilterFromParam(sport), before });
}

/**
 * The next fifty rows of a Players table. `href` is the page's own canonical
 * link (playersHref), so the chunk is read exactly as the page was; `offset`
 * is where the page left off.
 */
export async function loadPlayersAction(href: string, offset: string): Promise<Chunk> {
  await viewer();
  const at = Number(offset);
  if (!href.startsWith("/players?") || !Number.isInteger(at) || at <= 0 || at > 10_000) throw new Error("Bad cursor");
  const params = Object.fromEntries(new URLSearchParams(href.slice("/players?".length))) as PlayersParams;
  const view = resolveView(params, await getSeasons(leagueFromParam(params.sport).league));
  const { rows, next } = await tableRows(view, at);
  return {
    node: <GridRows columns={view.category.columns} rows={rows} rank={!view.q} activeKey={view.sort.key} />,
    next: next === null ? null : String(next),
  };
}
