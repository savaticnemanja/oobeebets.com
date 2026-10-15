"use client";

import * as React from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { reportAction, setBlockAction, setMuteAction } from "@/app/actions/moderation";
import { REPORT_REASONS } from "@/lib/report-reasons";
import type { ReportReason } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/misc";
import { cn } from "@/lib/utils";

/**
 * Report, mute and block, from a post's ⋯ menu or a profile's. Each refreshes
 * the page after, so a muted or blocked account's posts leave it at once.
 */

/** Mute / unmute and block / unblock, with a toast and a refresh. */
export function useModeration() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string } | null>) =>
    start(async () => {
      try {
        const r = await fn();
        if (r?.ok) {
          toast.success(r.message ?? "Done");
          router.refresh();
        } else if (r && !r.ok) toast.error(r.error ?? "That didn't work.");
      } catch {
        toast.error("That didn't go through — try again.");
      }
    });
  return {
    pending,
    mute: (userId: string, on: boolean) => run(() => setMuteAction(userId, on)),
    block: (userId: string, on: boolean) => run(() => setBlockAction(userId, on)),
  };
}

/** What blocking does, asked before it happens. */
export function BlockConfirm({
  username,
  open,
  onOpenChange,
  onConfirm,
}: {
  username: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogTitle>Block @{username}?</AlertDialogTitle>
        <AlertDialogDescription>
          You won&apos;t see each other&apos;s posts, and they can&apos;t follow you, reply to you, quote,
          like or repost your posts. Any follows between you end. They aren&apos;t told, but can tell
          from your profile.
        </AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button type="button" variant="outline">Cancel</Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button type="button" variant="danger" onClick={onConfirm}>
              Block
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Why you're reporting a post or an account, and an optional note — for the admins' queue. */
export function ReportDialog({
  target,
  open,
  onOpenChange,
}: {
  target: { postId: string; label: string } | { userId: string; label: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [reason, setReason] = React.useState<ReportReason | null>(null);
  const [note, setNote] = React.useState("");
  const [pending, start] = useTransition();

  function submit() {
    if (!reason) return;
    start(async () => {
      try {
        const r = await reportAction({ ...("postId" in target ? { postId: target.postId } : { userId: target.userId }), reason, note });
        if (r?.ok) {
          toast.success(r.message ?? "Reported");
          setReason(null);
          setNote("");
          onOpenChange(false);
        } else if (r && !r.ok) toast.error(r.error);
      } catch {
        toast.error("That didn't go through — try again.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report {target.label}</DialogTitle>
          <DialogDescription>An admin reads every report. The person you report isn&apos;t told who sent it.</DialogDescription>
        </DialogHeader>
        <fieldset>
          <legend className="text-sm font-medium text-fg">What&apos;s wrong with it?</legend>
          <div className="mt-2 space-y-1.5" role="radiogroup">
            {REPORT_REASONS.map((r) => (
              <button
                key={r.key}
                type="button"
                role="radio"
                aria-checked={reason === r.key}
                onClick={() => setReason(r.key)}
                className={cn(
                  "w-full rounded-xl border px-3 py-2 text-left transition-colors",
                  reason === r.key ? "border-brand/60 bg-brand/10" : "border-border hover:border-border-strong",
                )}
              >
                <span className={cn("block text-sm font-medium", reason === r.key ? "text-brand" : "text-fg")}>{r.label}</span>
                <span className="block text-xs text-fg-subtle">{r.hint}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <label htmlFor="report-note" className="mt-4 block text-sm font-medium text-fg">
          Anything to add? <span className="font-normal text-fg-subtle">(optional)</span>
        </label>
        <Textarea
          id="report-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          rows={3}
          className="mt-1.5"
        />
        <DialogFooter>
          <Button type="button" onClick={submit} disabled={!reason || pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
            Send report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
