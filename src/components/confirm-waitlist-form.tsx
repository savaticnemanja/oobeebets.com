"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Check, Loader2 } from "lucide-react";
import { confirmWaitlistAction, type ConfirmState } from "@/app/actions/waitlist";
import { Button } from "@/components/ui/button";

/** The confirm button, then what's next: the application, if they haven't answered it. */
export function ConfirmWaitlistForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<ConfirmState, FormData>(confirmWaitlistAction, null);

  if (state?.ok) {
    return (
      <div role="status" className="space-y-5">
        <div className="card-hairline flex items-start gap-4 p-5">
          <span className="mt-0.5 shrink-0 rounded-full bg-hit-dim p-2 text-hit">
            <Check className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight text-fg">You&apos;re on the list</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">
              <span className="break-words font-medium text-fg">{state.email}</span> is confirmed. We&apos;ll
              email you the day there&apos;s a place for you, and the odd update before then.
            </p>
          </div>
        </div>
        {state.answered ? (
          <Link href="/" className="text-sm text-brand hover:underline">
            Back to oobee bets
          </Link>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-fg-muted">
              Want in sooner? Testers who answer a few questions about how they bet are let in first. It takes
              about two minutes.
            </p>
            <Button asChild className="w-full">
              <Link href={`/signup?email=${encodeURIComponent(state.email)}`}>Answer the questions</Link>
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <Button type="submit" className="w-full" disabled={pending || !token}>
        {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
        Confirm my place
      </Button>
      {state && !state.ok && (
        <p role="alert" className="text-sm text-miss">
          {state.error}
        </p>
      )}
    </form>
  );
}
