"use client";

import * as React from "react";
import { Composer } from "@/components/social/composer";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/**
 * The composer in a dialog, opened by whatever `children` is — the floating
 * button on a phone, the sidebar's Post, a "write your first post" link. On a
 * phone it takes the whole screen, as X's does; from `sm` up it is a card.
 * Closes itself once the post is up.
 */
export function ComposeDialog({ viewerName, children }: { viewerName: string; children: React.ReactElement }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent
        // Full screen below sm — from under the notch down, no centring
        // transform, no card corners — with room for the close button.
        className="left-0 top-[var(--spacing-safe-top)] h-[calc(100dvh-var(--spacing-safe-top))] max-h-none w-full max-w-none translate-x-0 translate-y-0 rounded-none border-0 bg-black p-0 pt-12 sm:left-1/2 sm:top-[10dvh] sm:h-auto sm:max-h-[80dvh] sm:w-[calc(100vw-2rem)] sm:max-w-xl sm:-translate-x-1/2 sm:rounded-2xl sm:border sm:pt-12"
      >
        <DialogTitle className="sr-only">New post</DialogTitle>
        <Composer viewerName={viewerName} autoFocus onPosted={() => setOpen(false)} className="border-b-0" />
      </DialogContent>
    </Dialog>
  );
}
