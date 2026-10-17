import type { FeedPost } from "@/lib/social";
import type { ParlayView } from "@/lib/parlay-store";
import type { ViewerFollow } from "@/lib/follows";
import { PostCard, type PostPlay } from "@/components/social/post-card";
import { ParlayTicket } from "@/components/social/parlay-ticket";
import { ticketState } from "@/components/pick-state";

/**
 * What a post carrying a shared parlay adds to PostCard: the ticket where a
 * photo would go, and the Play control in its action row. Every place a post
 * is drawn — a timeline row, a repost, the post above a reply, the post's own
 * page — passes these, so a parlay post looks the same wherever it appears.
 */
export function parlayParts(
  post: FeedPost,
  viewerId: string | null,
  detail = false,
): { attachment?: React.ReactNode; play?: PostPlay } {
  if (!hasParlay(post)) return {};
  const { parlay } = post;
  const follow = playable(parlay, post.author.id, viewerId);
  return {
    attachment: <ParlayTicket parlay={parlay} detail={detail} />,
    play: follow && {
      parlayId: parlay.id,
      title: parlay.title ?? `${parlay.legs.length}-leg parlay`,
      follow,
      state: ticketState(parlay.status, parlay.legs.map((l) => l.startsAt.getTime()), Date.now()),
    },
  };
}

/** A shared Community parlay as a timeline row: a post like any other. */
export function ParlayPost({
  post,
  viewerId,
  isAdmin,
  repostedBy,
}: {
  post: FeedPost & { parlay: NonNullable<FeedPost["parlay"]> };
  viewerId: string | null;
  isAdmin: boolean;
  repostedBy?: { username: string; displayName: string | null } | null;
}) {
  return (
    <PostCard post={post} viewerId={viewerId} isAdmin={isAdmin} repostedBy={repostedBy} {...parlayParts(post, viewerId)} />
  );
}

/**
 * The viewer's "I played this" on someone else's ticket — while it's open,
 * or once they've played it (then it shows locked, ticked).
 */
export function playable(parlay: ParlayView, ownerId: string | null, viewerId: string | null): ViewerFollow | undefined {
  if (!viewerId || ownerId === viewerId) return undefined;
  if (!parlay.open && !parlay.played) return undefined;
  return { taken: Boolean(parlay.played), open: parlay.open };
}

/** Narrows a post to one that carries a readable ticket. */
export function hasParlay(post: FeedPost): post is FeedPost & { parlay: NonNullable<FeedPost["parlay"]> } {
  return Boolean(post.parlay);
}
