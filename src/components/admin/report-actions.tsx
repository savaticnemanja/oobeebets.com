"use client";

import * as React from "react";
import { useTransition } from "react";
import { Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { resolveReportAction } from "@/app/actions/moderation";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/misc";
import { tryAction } from "@/lib/try-action";

/** An open report's two answers: take the post down (asked first — it can't be undone) or dismiss. */
export function ReportActions({ reportId, canRemove }: { reportId: string; canRemove: boolean }) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = React.useState(false);
  const resolve = (outcome: "removed" | "dismissed") =>
    start(async () => {
      const r = await tryAction(() => resolveReportAction(reportId, outcome));
      if (r?.ok) toast.success(r.message ?? "Done");
      else if (r) toast.error(r.error);
    });
  return (
    <div className="flex shrink-0 items-center gap-2">
      {canRemove && (
        <Button type="button" size="sm" variant="danger" disabled={pending} onClick={() => setConfirming(true)}>
          <Trash2 aria-hidden="true" />
          Remove post
        </Button>
      )}
      <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => resolve("dismissed")}>
        <X aria-hidden="true" />
        Dismiss
      </Button>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogTitle>Remove this post?</AlertDialogTitle>
          <AlertDialogDescription>
            It&apos;s deleted for everyone, with its replies, and every open report on it closes. The text stays
            here and in the audit log.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button type="button" variant="outline">Cancel</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button type="button" variant="danger" onClick={() => resolve("removed")}>
                Remove post
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
