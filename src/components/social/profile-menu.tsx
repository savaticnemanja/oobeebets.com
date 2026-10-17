"use client";

import * as React from "react";
import { Ban, Flag, MoreHorizontal, Volume2, VolumeX } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BlockConfirm, ReportDialog, useModeration } from "@/components/social/moderation-dialogs";

/** The ⋯ beside Follow on someone else's profile: mute, block, report. */
export function ProfileMenu({
  userId,
  username,
  muted,
  blocked,
}: {
  userId: string;
  username: string;
  muted: boolean;
  blocked: boolean;
}) {
  const moderation = useModeration();
  const [reporting, setReporting] = React.useState(false);
  const [blocking, setBlocking] = React.useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`More about @${username}`}
          className="grid size-9 place-items-center rounded-full border border-border text-fg transition-colors hover:bg-white/[0.07]"
        >
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52">
          <DropdownMenuItem disabled={moderation.pending} onSelect={() => moderation.mute(userId, !muted)}>
            {muted ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
            {muted ? `Unmute @${username}` : `Mute @${username}`}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={moderation.pending}
            onSelect={() => (blocked ? moderation.block(userId, false) : setBlocking(true))}
            className={blocked ? undefined : "text-miss focus:text-miss"}
          >
            <Ban aria-hidden="true" />
            {blocked ? `Unblock @${username}` : `Block @${username}`}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setReporting(true)}>
            <Flag aria-hidden="true" />
            Report @{username}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ReportDialog target={{ userId, label: `@${username}` }} open={reporting} onOpenChange={setReporting} />
      <BlockConfirm username={username} open={blocking} onOpenChange={setBlocking} onConfirm={() => moderation.block(userId, true)} />
    </>
  );
}
