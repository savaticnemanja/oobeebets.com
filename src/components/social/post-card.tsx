"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { Heart, Link2, MessageCircle, MoreHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deletePostAction, setPostLikeAction } from "@/app/actions/social";
import type { FeedPost } from "@/lib/social";
import { compactCount, relativeTime } from "@/lib/social-rules";
import { Avatar, NameLine, displayNameOf } from "@/components/social/identity";
import { LinkCard } from "@/components/social/link-card";
import { PostBody } from "@/components/social/post-body";
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
}: {
  post: FeedPost;
  viewerId: string | null;
  isAdmin: boolean;
  variant?: Variant;
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
        "relative flex gap-3 px-4",
        detail ? "pt-4" : "py-3",
        variant === "feed" && "cursor-pointer border-b border-border transition-colors hover:bg-surface/60",
        variant === "ancestor" && "cursor-pointer pb-1 transition-colors hover:bg-surface/60",
      )}
    >
      {!detail && (
        <div className="flex flex-col items-center">
          <Link href={`/u/${post.author.username}`} aria-label={displayNameOf(post.author)}>
            <Avatar name={displayNameOf(post.author)} />
          </Link>
          {variant === "ancestor" && <span className="mt-1 w-0.5 flex-1 bg-border-strong" aria-hidden="true" />}
        </div>
      )}

      <div className="min-w-0 flex-1">
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
            <Link
              href={href}
              className="shrink-0 text-sm text-fg-subtle hover:underline"
              title={post.createdAt.toLocaleString()}
            >
              <time dateTime={post.createdAt.toISOString()} suppressHydrationWarning>
                {relativeTime(post.createdAt)}
              </time>
            </Link>
            <div className="ml-auto -my-1">
              <PostMenu post={post} viewerId={viewerId} isAdmin={isAdmin} />
            </div>
          </div>
        )}

        {post.replyToUsername && (
          <p className="mt-0.5 text-sm text-fg-subtle">
            Replying to{" "}
            <Link href={`/u/${post.replyToUsername}`} className="text-brand hover:underline">
              @{post.replyToUsername}
            </Link>
          </p>
        )}

        <PostBody body={post.body} className={cn("mt-1", detail ? "mt-3 text-lg leading-relaxed" : "text-[0.9375rem] leading-normal")} />

        {post.preview && <LinkCard preview={post.preview} className="mt-3" />}

        {detail && (
          <p className="mt-4 border-b border-border pb-3 text-sm text-fg-subtle">
            <time dateTime={post.createdAt.toISOString()} suppressHydrationWarning>
              {post.createdAt.toLocaleString("en-US", {
                hour: "numeric",
                minute: "2-digit",
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </time>
          </p>
        )}

        <PostActions post={post} viewerId={viewerId} detail={detail} />
      </div>
    </article>
  );
}

/* --------------------------------------------------------------- actions */

function PostActions({ post, viewerId, detail }: { post: FeedPost; viewerId: string | null; detail: boolean }) {
  const [like, setLike] = useOptimistic({ liked: post.liked, count: post.likeCount });
  const [, startTransition] = useTransition();
  const router = useRouter();

  function toggleLike() {
    if (!viewerId) {
      router.push(`/login?next=/p/${post.id}`);
      return;
    }
    const next = !like.liked;
    startTransition(async () => {
      setLike({ liked: next, count: like.count + (next ? 1 : -1) });
      const result = await setPostLikeAction(post.id, next);
      if (result && !result.ok) toast.error(result.error);
    });
  }

  async function copyLink() {
    const url = new URL(`/p/${post.id}`, window.location.origin).toString();
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy — your browser blocked it.");
    }
  }

  const btn =
    "group/act relative z-10 inline-flex items-center gap-1.5 rounded-full py-1.5 pr-2 text-sm text-fg-subtle transition-colors";

  return (
    <div className={cn("-ml-2 flex items-center justify-between", detail ? "max-w-sm border-b border-border py-1.5" : "mt-1.5 max-w-xs")}>
      <Link
        href={detail ? "#reply" : `/p/${post.id}#reply`}
        className={cn(btn, "hover:text-brand")}
        aria-label={`Reply${post.replyCount ? `, ${post.replyCount} replies` : ""}`}
      >
        <span className="grid size-8 place-items-center rounded-full group-hover/act:bg-brand/10">
          <MessageCircle className="size-[1.125rem]" aria-hidden="true" />
        </span>
        {post.replyCount > 0 && <span className="num -ml-1">{compactCount(post.replyCount)}</span>}
      </Link>

      <button
        type="button"
        onClick={toggleLike}
        aria-pressed={like.liked}
        aria-label={`${like.liked ? "Unlike" : "Like"}${like.count ? `, ${like.count} likes` : ""}`}
        className={cn(btn, like.liked ? "text-pink-500" : "hover:text-pink-500")}
      >
        <span className="grid size-8 place-items-center rounded-full group-hover/act:bg-pink-500/10">
          <Heart className={cn("size-[1.125rem]", like.liked && "fill-current")} aria-hidden="true" />
        </span>
        {like.count > 0 && <span className="num -ml-1">{compactCount(like.count)}</span>}
      </button>

      <button type="button" onClick={copyLink} aria-label="Copy link to post" className={cn(btn, "hover:text-brand")}>
        <span className="grid size-8 place-items-center rounded-full group-hover/act:bg-brand/10">
          <Link2 className="size-[1.125rem]" aria-hidden="true" />
        </span>
      </button>
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
