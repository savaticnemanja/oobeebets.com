"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Ban, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/misc";
import { setUserSuspendedAction } from "@/app/actions/admin";

/**
 * Suspend an account, or lift it, from its admin page. Suspending asks why
 * (kept for the admins, never shown to the person or anyone else) and waits
 * for a yes; the dialog closes only once the reason is there, so it isn't an
 * AlertDialogAction (that closes on every click).
 */
export function SuspendControl({ userId, username, suspended }: { userId: string; username: string; suspended: boolean }) {
  const [state, action] = useActionState(setUserSuspendedAction, null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [missing, setMissing] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (state?.ok) toast.success(state.message ?? "Updated");
    else if (state && !state.ok) toast.error(state.error);
  }, [state]);

  const confirm = () => {
    if (!suspended && !reason.trim()) {
      setMissing(true);
      return;
    }
    const fd = new FormData();
    fd.set("userId", userId);
    fd.set("suspend", suspended ? "no" : "yes");
    fd.set("reason", reason.trim());
    start(() => action(fd));
    setOpen(false);
    setReason("");
    setMissing(false);
  };

  return (
    <>
      <Button
        type="button"
        variant={suspended ? "outline" : "ghost"}
        size="sm"
        className={suspended ? undefined : "text-miss hover:text-miss"}
        onClick={() => setOpen(true)}
        disabled={pending}
      >
        {suspended ? <RotateCcw aria-hidden="true" /> : <Ban aria-hidden="true" />}
        {suspended ? "Unsuspend" : "Suspend"}
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogTitle>{suspended ? `Lift @${username}'s suspension?` : `Suspend @${username}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            {suspended
              ? "They can sign in again, and their posts and parlays show again everywhere."
              : "They're signed out everywhere and can't sign in. Their posts, replies and parlays stop showing to anyone until you lift it. Nothing is deleted."}
          </AlertDialogDescription>
          {!suspended && (
            <div>
              <label htmlFor="suspend-reason" className="text-sm font-medium text-fg">
                Reason <span className="font-normal text-fg-subtle">(admins only)</span>
              </label>
              <textarea
                id="suspend-reason"
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  setMissing(false);
                }}
                maxLength={300}
                rows={3}
                placeholder="e.g. spam, harassment reported twice"
                aria-invalid={missing || undefined}
                aria-describedby={missing ? "suspend-reason-error" : undefined}
                className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:border-brand/60 focus:outline-none aria-[invalid=true]:border-miss/60"
              />
              {missing && (
                <p id="suspend-reason-error" role="alert" className="mt-1.5 text-xs text-miss">
                  Say why — it goes in the audit log.
                </p>
              )}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </AlertDialogCancel>
            <Button type="button" variant={suspended ? "default" : "danger"} onClick={confirm}>
              {suspended ? "Unsuspend" : "Suspend"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
