"use client";

import * as React from "react";
import { Composer } from "@/components/social/composer";
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
 */
export function ComposeDialog({ viewerName, children }: { viewerName: string; children: React.ReactElement }) {
  const [open, setOpen] = React.useState(false);
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
        <DialogTrigger asChild>{children}</DialogTrigger>
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
          <DialogTitle className="sr-only">New post</DialogTitle>
          <Composer
            viewerName={viewerName}
            autoFocus
            onDirtyChange={trackDirty}
            onPosted={close}
            className="border-b-0"
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogTitle>Discard post?</AlertDialogTitle>
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
