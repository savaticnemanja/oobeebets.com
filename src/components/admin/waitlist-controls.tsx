"use client";

import { useState, useTransition } from "react";
import { Loader2, Mail, Send } from "lucide-react";
import { toast } from "sonner";
import { inviteFromWaitlistAction, notifyWaitlistAction } from "@/app/actions/admin-waitlist";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/misc";
import { tryAction } from "@/lib/try-action";

/** Sends one waiting person a normal invite. "Invite again" mints a fresh link. */
/** Confirmed rows only: an unconfirmed address may be one a bot typed in. */
export function WaitlistInvite({ id, invited, confirmed }: { id: string; invited: boolean; confirmed: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={pending || !confirmed}
      title={confirmed ? undefined : "They haven't confirmed their address yet"}
      onClick={() =>
        start(async () => {
          const result = await tryAction(() => inviteFromWaitlistAction(id));
          if (result?.ok) toast.success(result.message ?? "Invite sent");
          else toast.error(result?.error ?? "Couldn't send that invite");
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Mail aria-hidden="true" />}
      {invited ? "Invite again" : "Invite"}
    </Button>
  );
}

/** "Sign-ups are open" to everyone not yet told — asks first, since mail can't be recalled. */
export function WaitlistNotify({ count }: { count: number }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button type="button" disabled={pending || count === 0}>
          {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Send aria-hidden="true" />}
          Tell {count} {count === 1 ? "person" : "people"} sign-ups are open
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogTitle>
          Email {count} {count === 1 ? "person" : "people"}?
        </AlertDialogTitle>
        <AlertDialogDescription>
          Everyone still waiting who hasn&apos;t been told gets the one &ldquo;sign-ups are
          open&rdquo; email the waitlist promised, with a link to /signup. It can&apos;t be recalled.
        </AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() =>
              start(async () => {
                const result = await tryAction(() => notifyWaitlistAction());
                if (result?.ok) toast.success(result.message ?? "Sent");
                else toast.error(result?.error ?? "Couldn't send");
              })
            }
          >
            Send
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
