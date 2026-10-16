"use client";

import * as React from "react";
import { Composer } from "@/components/social/composer";
import { Avatar, NameLine, displayNameOf } from "@/components/social/identity";
import { PostBody } from "@/components/social/post-body";
import { LocalTime } from "@/components/local-time";
import type { FeedPost, QuotedPost } from "@/lib/social";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/misc";

/**
 * The composer in a dialog, opened by whatever `children` is — the floating
 * button on a phone, the sidebar's Post, a "write your first post" link. On a
 * phone it takes the whole screen, as X's does; from `sm` up it is a card.
 * Closes itself once the post is up.
 *
 * Closing it with something written — the ×, Escape, a click outside — asks
 * first, as X does, rather than throwing the draft away without a word.
 *
 * With `parent` it's a reply, opened from a post's Reply in a timeline so
 * the timeline stays where it was: the post being answered on top, joined to
 * the draft by the thread line, as on X. With `quote` it's a quote post: the
 * quoted post as a card under the draft.
 *
 * Opened by `children`, or held open by the caller (`open`) — a post's
 * Repost menu opens it for Quote that way.
 */
export function ComposeDialog({
  viewerName,
  parent,
  quote,
  onPosted,
  open: openProp,
  onOpenChange,
  children,
}: {
  viewerName: string;
  parent?: FeedPost;
  quote?: QuotedPost;
  /** After the post or reply is up — a reply count goes up by one, say. */
  onPosted?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactElement;
}) {
  const [ownOpen, setOwnOpen] = React.useState(false);
  const open = openProp ?? ownOpen;
  const setOpen = onOpenChange ?? setOwnOpen;
  const [confirming, setConfirming] = React.useState(false);
  const dirty = React.useRef(false);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const trackDirty = React.useCallback((d: boolean) => {
    dirty.current = d;
  }, []);

  function close() {
    dirty.current = false;
    setOpen(false);
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (next) setOpen(true);
          else if (dirty.current) setConfirming(true);
          else close();
        }}
      >
        {children && <DialogTrigger asChild>{children}</DialogTrigger>}
        <DialogContent
          ref={contentRef}
          // The emoji panel is part of the composer, not a layer of its own,
          // so the dialog hears its Escape first. That Escape is for the panel
          // (which closes itself), not for the dialog and the draft in it.
          onEscapeKeyDown={(e) => {
            if (contentRef.current?.querySelector("[data-composer-popup]")) e.preventDefault();
          }}
          // Full screen below sm — from under the notch down, no centring
          // transform, no card corners — with room for the close button.
          className="left-0 top-[var(--spacing-safe-top)] h-[calc(100dvh-var(--spacing-safe-top))] max-h-none w-full max-w-none translate-x-0 translate-y-0 rounded-none border-0 bg-black p-0 pt-12 sm:left-1/2 sm:top-[10dvh] sm:h-auto sm:max-h-[80dvh] sm:w-[calc(100vw-2rem)] sm:max-w-xl sm:-translate-x-1/2 sm:rounded-2xl sm:border sm:pt-12"
        >
          <DialogTitle className="sr-only">{parent ? "Reply" : quote ? "Quote" : "New post"}</DialogTitle>
          {parent && <ReplyingTo post={parent} />}
          <Composer
            viewerName={viewerName}
            parentId={parent?.id}
            quote={quote}
            placeholder={parent ? "Post your reply" : quote ? "Add a comment" : undefined}
            submitLabel={parent ? "Reply" : undefined}
            autoFocus
            onDirtyChange={trackDirty}
            onPosted={() => {
              close();
              onPosted?.();
            }}
            className={parent ? "border-b-0 pt-0" : "border-b-0"}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogTitle>{parent ? "Discard reply?" : "Discard post?"}</AlertDialogTitle>
          <AlertDialogDescription>
            This can&apos;t be undone, and you&apos;ll lose what you&apos;ve written.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button type="button" variant="outline">Keep editing</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button type="button" variant="danger" onClick={close}>
                Discard
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** The post a reply answers, above the draft, with the thread line running down to it. */
function ReplyingTo({ post }: { post: FeedPost }) {
  return (
    <div className="flex gap-3 px-4">
      <div className="flex flex-col items-center">
        <Avatar name={displayNameOf(post.author)} avatarId={post.author.avatarId} />
        <span className="mt-1 w-0.5 flex-1 bg-border-strong" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1 pb-4">
        <div className="flex items-center gap-1">
          <NameLine user={post.author} />
          <span className="text-sm text-fg-subtle" aria-hidden="true">·</span>
          <LocalTime at={post.createdAt} format="ago" className="shrink-0 text-sm text-fg-subtle" />
        </div>
        {post.body ? (
          <PostBody body={post.body} className="mt-1 line-clamp-6 text-[0.9375rem] leading-normal" />
        ) : post.parlayId ? (
          <p className="mt-1 text-[0.9375rem] text-fg-muted">Shared a parlay</p>
        ) : null}
        <p className="mt-3 text-sm text-fg-subtle">
          Replying to <span className="text-brand">@{post.author.username}</span>
        </p>
      </div>
    </div>
  );
}
