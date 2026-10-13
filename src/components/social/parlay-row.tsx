import { Repeat2 } from "lucide-react";
import Link from "next/link";
import type { FeedPost } from "@/lib/social";
import { ParlayCard } from "@/components/parlay-card";
import { PostActions } from "@/components/social/post-card";
import { displayNameOf } from "@/components/social/identity";

/**
 * A shared Community parlay in a timeline, the Community tab, wherever: the
 * flat ticket with who shared it and when in its header — and, since a shared
 * parlay is a post, the post's Reply · Repost · Like row under it.
 */
export function ParlayPost({
  post,
  viewerId,
  repostedBy,
}: {
  post: FeedPost & { parlay: NonNullable<FeedPost["parlay"]> };
  viewerId: string | null;
  repostedBy?: { username: string; displayName: string | null } | null;
}) {
  return (
    <ParlayCard
      parlay={post.parlay}
      variant="row"
      owner={{ username: post.author.username, displayName: post.author.displayName, role: post.author.role }}
      postHref={`/p/${post.id}`}
      kicker={
        repostedBy ? (
          <Link
            href={`/u/${repostedBy.username}`}
            className="mb-2 flex items-center gap-2 text-[0.8125rem] font-semibold text-fg-subtle hover:underline"
          >
            <Repeat2 className="size-4" aria-hidden="true" />
            {displayNameOf(repostedBy)} reposted
          </Link>
        ) : null
      }
      footer={<PostActions post={post} viewerId={viewerId} className="mt-2" />}
    />
  );
}

/** Narrows a post to one that carries a readable ticket. */
export function hasParlay(post: FeedPost): post is FeedPost & { parlay: NonNullable<FeedPost["parlay"]> } {
  return Boolean(post.parlay);
}
