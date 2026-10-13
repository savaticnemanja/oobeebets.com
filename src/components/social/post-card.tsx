"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useKeptOptimistic } from "@/components/use-kept-optimistic";
import { BarChart2, Heart, MessageCircle, MoreHorizontal, Repeat2, Share, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deletePostAction, setPostLikeAction, setPostRepostAction } from "@/app/actions/social";
import type { FeedPost } from "@/lib/social";
import { compactCount } from "@/lib/social-rules";
import { LocalTime } from "@/components/local-time";
import { Avatar, NameLine, displayNameOf } from "@/components/social/identity";
import { LinkCard } from "@/components/social/link-card";
import { PostBody } from "@/components/social/post-body";
import { PostMedia } from "@/components/social/post-media";
import { PostPoll } from "@/components/social/post-poll";
import { trackView } from "@/components/social/view-tracker";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Variant = "feed" | "detail" | "ancestor";

/**
 * One post, in the three places it appears:
 *
 *   feed     — a row in a timeline; the whole row opens the post
 *   ancestor — a post above the one being read, joined to it by a thread line
 *   detail   — the post being read: bigger text, full timestamp
 *
 * The row is clickable the way X's are, but through a click handler rather
 * than a wrapping <a>: links can't nest, and the row holds several (the
 * author, the link card, @mentions). Clicks that land on any of those, or
 * that finish a text selection, are left alone.
 */
export function PostCard({
  post,
  viewerId,
  isAdmin,
  variant = "feed",
  showReplyTo = true,
  threadAbove = false,
  repostedBy,
  attachment,
}: {
  post: FeedPost;
  viewerId: string | null;
  isAdmin: boolean;
  variant?: Variant;
  /** Off when the post being replied to is drawn right above. */
  showReplyTo?: boolean;
  /**
   * The post it answers is drawn right above (an `ancestor`): the thread line
   * carries on down into this row and stops at the avatar, so the two read
   * as one unbroken conversation, as on X.
   */
  threadAbove?: boolean;
  /** This row is someone's repost: "↻ Name reposted" above it, as on X. */
  repostedBy?: { username: string; displayName: string | null } | null;
  /** Drawn where a link card would go — a shared parlay's ticket. */
  attachment?: React.ReactNode;
}) {
  const router = useRouter();
  const href = `/p/${post.id}`;
  const detail = variant === "detail";

  function openPost(e: React.MouseEvent<HTMLElement>) {
    if (detail) return;
    const target = e.target as HTMLElement;
    // React bubbles portal events through the component tree, so a click in
    // the delete dialog or the menu arrives here although it is nowhere near
    // this row in the DOM. Only clicks physically inside the row count.
    if (!e.currentTarget.contains(target)) return;
    if (target.closest("a,button")) return;
    if (window.getSelection()?.toString()) return;
    if (e.metaKey || e.ctrlKey) window.open(href, "_blank");
    else router.push(href);
  }

  return (
    <article
      onClick={openPost}
      className={cn(
        // A repost line spans the row above the avatar and the content.
        repostedBy ? "relative flex flex-wrap gap-x-3 gap-y-1 px-4" : "relative flex gap-3 px-4",
        // With the thread line coming in from above, the line itself takes
        // the place of the top padding.
        detail
          ? threadAbove ? "pt-0" : "pt-4"
          : variant === "ancestor"
            ? threadAbove || repostedBy ? "" : "pt-3"
            : threadAbove || repostedBy ? "pb-3" : "py-3",
        variant === "feed" && "cursor-pointer border-b border-border transition-colors hover:bg-surface/60",
        variant === "ancestor" && "cursor-pointer transition-colors hover:bg-surface/60",
      )}
    >
      {repostedBy && <RepostedLine by={repostedBy} />}
      {!detail && (
        <div className="flex flex-col items-center">
          {/* The line from the post above, ending 4px short of the avatar —
              together with the ancestor's it spans the whole gap. */}
          {threadAbove && <span className="mb-1 h-2 w-0.5 bg-border-strong" aria-hidden="true" />}
          <Link href={`/u/${post.author.username}`} aria-label={displayNameOf(post.author)}>
            <Avatar name={displayNameOf(post.author)} />
          </Link>
          {/* Runs to the row's very bottom (no bottom padding on an ancestor),
              meeting the line at the top of the reply. */}
          {variant === "ancestor" && <span className="mt-1 w-0.5 flex-1 bg-border-strong" aria-hidden="true" />}
        </div>
      )}

      <div className={cn("min-w-0 flex-1", variant === "ancestor" && "pb-1")}>
        {/* The detail view has no avatar column, so its end of the thread
            line sits over the header's avatar (40px wide: centred at 19px). */}
        {detail && threadAbove && <span className="mb-1 ml-[19px] block h-3 w-0.5 bg-border-strong" aria-hidden="true" />}
        {detail ? (
          <div className="flex items-center gap-3">
            <Link href={`/u/${post.author.username}`} aria-label={displayNameOf(post.author)}>
              <Avatar name={displayNameOf(post.author)} />
            </Link>
            <NameLine user={post.author} stacked />
            <div className="ml-auto">
              <PostMenu post={post} viewerId={viewerId} isAdmin={isAdmin} />
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <NameLine user={post.author} />
            <span className="text-sm text-fg-subtle" aria-hidden="true">·</span>
            <Link href={href} className="shrink-0 text-sm text-fg-subtle hover:underline">
              <LocalTime at={post.createdAt} format="ago" />
            </Link>
            <div className="ml-auto -my-1">
              <PostMenu post={post} viewerId={viewerId} isAdmin={isAdmin} />
            </div>
          </div>
        )}

        {showReplyTo && post.replyToUsername && (
          <p className="mt-0.5 text-sm text-fg-subtle">
            Replying to{" "}
            <Link href={`/u/${post.replyToUsername}`} className="text-brand hover:underline">
              @{post.replyToUsername}
            </Link>
          </p>
        )}

        {post.body && (
          <PostBody body={post.body} className={cn("mt-1", detail ? "mt-3 text-lg leading-relaxed" : "text-[0.9375rem] leading-normal")} />
        )}

        {post.media && post.media.length > 0 && <PostMedia media={post.media} className="mt-3" />}
        {post.poll && <PostPoll postId={post.id} poll={post.poll} viewerId={viewerId} authorId={post.author.id} />}
        {/* A link card only when nothing else is showing, as on X. */}
        {post.preview && !post.media?.length && !post.poll && <LinkCard preview={post.preview} className="mt-3" />}
        {attachment && <div className="mt-2">{attachment}</div>}

        {detail && (
          <p className="mt-4 border-b border-border pb-3 text-sm text-fg-subtle">
            <LocalTime at={post.createdAt} format="stamp" />
          </p>
        )}

        <PostActions post={post} viewerId={viewerId} detail={detail} />
      </div>
    </article>
  );
}

/**
 * "↻ Name reposted", over a reposted row: the icon right-aligned in the
 * avatar column's width, the name lined up with the post's text, as on X.
 */
export function RepostedLine({ by }: { by: { username: string; displayName: string | null } }) {
  return (
    <div className="flex basis-full items-center gap-3 pt-2 text-[0.8125rem] font-semibold text-fg-subtle">
      <span className="flex w-10 shrink-0 justify-end">
        <Repeat2 className="size-4" aria-hidden="true" />
      </span>
      <Link href={`/u/${by.username}`} className="truncate hover:underline">
        {displayNameOf(by)} reposted
      </Link>
    </div>
  );
}

/* --------------------------------------------------------------- actions */

/**
 * Reply · Repost · Like · Copy link, as on X. Exported for the ticket of a
 * shared parlay, which is a post too and carries the same row under it.
 */
export function PostActions({
  post,
  viewerId,
  detail = false,
  className,
}: {
  post: FeedPost;
  viewerId: string | null;
  detail?: boolean;
  className?: string;
}) {
  const [like, setLike, keepLike] = useKeptOptimistic({ liked: post.liked, count: post.likeCount });
  const [repost, setRepost, keepRepost] = useKeptOptimistic({ reposted: post.reposted, count: post.repostCount });
  const [, startTransition] = useTransition();
  const router = useRouter();

  function toggleLike() {
    if (!viewerId) {
      router.push(`/login?next=/p/${post.id}`);
      return;
    }
    const next = !like.liked;
    startTransition(async () => {
      const value = { liked: next, count: like.count + (next ? 1 : -1) };
      setLike(value);
      const result = await setPostLikeAction(post.id, next);
      if (result && !result.ok) toast.error(result.error);
      else keepLike(value);
    });
  }

  function toggleRepost() {
    if (!viewerId) {
      router.push(`/login?next=/p/${post.id}`);
      return;
    }
    const next = !repost.reposted;
    startTransition(async () => {
      const value = { reposted: next, count: repost.count + (next ? 1 : -1) };
      setRepost(value);
      const result = await setPostRepostAction(post.id, next);
      if (result && !result.ok) toast.error(result.error);
      else {
        keepRepost(value);
        if (next) toast.success("Reposted");
      }
    });
  }

  // The phone's own share sheet where there is one; otherwise copy the link.
  async function share() {
    const url = new URL(`/p/${post.id}`, window.location.origin).toString();
    if (typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches) {
      try {
        await navigator.share({ url });
      } catch {
        // Dismissing the sheet rejects; nothing to say about that.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy — your browser blocked it.");
    }
  }

  // This row is on screen → the post is being seen. See view-tracker.
  const rowRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!viewerId || !rowRef.current) return;
    return trackView(rowRef.current, post.id);
  }, [post.id, viewerId]);

  const btn =
    "group/act relative z-10 inline-flex items-center gap-1.5 rounded-full py-1.5 pr-2 text-sm text-fg-subtle transition-colors";
  // Reply, repost and like sit in equal cells, so the gaps between them
  // don't shift with how wide each count is; views and share go right — X's row.
  const cell = detail ? "w-24" : "w-[4.5rem] sm:w-20";

  return (
    <div
      ref={rowRef}
      className={cn(
        "-ml-2 flex items-center justify-between",
        detail ? "border-b border-border py-1.5" : "mt-1.5",
        className,
      )}
    >
      <div className="flex items-center">
        <Link
          href={detail ? "#reply" : `/p/${post.id}#reply`}
          className={cn(btn, cell, "hover:text-brand")}
          aria-label={`Reply${post.replyCount ? `, ${post.replyCount} replies` : ""}`}
        >
          <span className="grid size-8 place-items-center rounded-full group-hover/act:bg-brand/10">
            <MessageCircle className="size-[1.125rem]" aria-hidden="true" />
          </span>
          {post.replyCount > 0 && <span className="num -ml-1">{compactCount(post.replyCount)}</span>}
        </Link>

        <button
          type="button"
          onClick={toggleRepost}
          aria-pressed={repost.reposted}
          aria-label={`${repost.reposted ? "Undo repost" : "Repost"}${repost.count ? `, ${repost.count} reposts` : ""}`}
          className={cn(btn, cell, repost.reposted ? "text-hit" : "hover:text-hit")}
        >
          <span className="grid size-8 place-items-center rounded-full group-hover/act:bg-hit/10">
            <Repeat2 className="size-[1.125rem]" aria-hidden="true" />
          </span>
          {repost.count > 0 && <span className="num -ml-1">{compactCount(repost.count)}</span>}
        </button>

        <button
          type="button"
          onClick={toggleLike}
          aria-pressed={like.liked}
          aria-label={`${like.liked ? "Unlike" : "Like"}${like.count ? `, ${like.count} likes` : ""}`}
          className={cn(btn, cell, like.liked ? "text-pink-500" : "hover:text-pink-500")}
        >
          <span className="grid size-8 place-items-center rounded-full group-hover/act:bg-pink-500/10">
            <Heart className={cn("size-[1.125rem]", like.liked && "fill-current")} aria-hidden="true" />
          </span>
          {like.count > 0 && <span className="num -ml-1">{compactCount(like.count)}</span>}
        </button>
      </div>

      <div className="flex items-center">
        <span
          className={cn(btn, "cursor-default")}
          title={`${post.viewCount} ${post.viewCount === 1 ? "person has" : "people have"} seen this`}
          aria-label={`${post.viewCount} views`}
        >
          <span className="grid size-8 place-items-center rounded-full">
            <BarChart2 className="size-[1.125rem]" aria-hidden="true" />
          </span>
          {post.viewCount > 0 && <span className="num -ml-1">{compactCount(post.viewCount)}</span>}
        </span>
        <button type="button" onClick={share} aria-label="Share post" className={cn(btn, "pr-0 hover:text-brand")}>
          <span className="grid size-8 place-items-center rounded-full group-hover/act:bg-brand/10">
            <Share className="size-[1.125rem]" aria-hidden="true" />
          </span>
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ menu */

function PostMenu({ post, viewerId, isAdmin }: { post: FeedPost; viewerId: string | null; isAdmin: boolean }) {
  const [confirming, setConfirming] = React.useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const own = viewerId === post.author.id;
  if (!own && !isAdmin) return null;

  function remove() {
    startTransition(async () => {
      const result = await deletePostAction(post.id);
      if (result && !result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Post deleted");
      setConfirming(false);
      // Standing on the deleted post's own page leaves nothing to show.
      if (window.location.pathname === `/p/${post.id}`) router.replace("/home");
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="More"
          className="relative z-10 grid size-8 place-items-center rounded-full text-fg-subtle transition-colors hover:bg-brand/10 hover:text-brand"
        >
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setConfirming(true)} className="text-miss focus:text-miss">
            <Trash2 aria-hidden="true" />
            {own ? "Delete" : "Remove post (admin)"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogTitle>Delete post?</AlertDialogTitle>
          <AlertDialogDescription>
            This can&apos;t be undone. The post disappears from profiles and feeds, along
            with every reply under it.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button type="button" variant="outline">Cancel</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                type="button"
                variant="danger"
                disabled={pending}
                onClick={(e) => {
                  e.preventDefault();
                  remove();
                }}
              >
                Delete
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
