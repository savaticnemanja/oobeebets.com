"use client";

import * as React from "react";
import { useActionState } from "react";
import { Check, ListPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { joinWaitlistAction } from "@/app/actions/waitlist";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SpamGuardFields } from "@/components/spam-guard-fields";

/**
 * The homepage's box: an email onto the waitlist (unconfirmed until its
 * confirmation link is used — lib/waitlist.ts). `formToken` comes from the
 * page (issueFormToken) — see lib/spam-guard.ts.
 */
export function JoinWaitlistForm({ formToken }: { formToken: string }) {
  const [state, formAction, pending] = useActionState(joinWaitlistAction, null);

  // Controlled only so the confirmation can name the address back. It is the
  // one thing that turns "something happened" into "the address I typed is the
  // one that got it", and it catches a typo while the visitor still cares.
  const [email, setEmail] = React.useState("");

  if (state?.ok) return <Joined email={email} />;

  const errorId = state && !state.ok ? "waitlist-error" : undefined;

  return (
    <form action={formAction} className="mt-8">
      <SpamGuardFields token={formToken} />
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1">
          <Label htmlFor="waitlist-email" className="sr-only">
            Email address
          </Label>
          <Input
            id="waitlist-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
            className="h-12 sm:text-base"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={Boolean(errorId)}
            aria-describedby={errorId}
          />
        </div>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <ListPlus aria-hidden="true" />
          )}
          Join the waitlist
        </Button>
      </div>

      {errorId && (
        <p id={errorId} role="alert" className="mt-3 text-sm text-miss">
          {state && !state.ok ? state.error : null}
        </p>
      )}

      <p className="mt-3 text-xs leading-relaxed text-fg-subtle">
        We&rsquo;ll ask you to confirm, then email you the day there&rsquo;s a place for you,
        with the odd update before. No picks, no spam, unsubscribe in one click.
      </p>
    </form>
  );
}

/**
 * Replaces the form in place rather than stacking a message under it: there is
 * nothing left to do here, and leaving a live field below a success message
 * invites a second submission.
 *
 * Kept to roughly the height of the form it replaces, so the page does not
 * lurch under the reader at the moment they succeed. That mattered more when
 * the layout was pinned to the viewport, but a block that changes height on
 * submit is worth avoiding either way.
 *
 * Announcement is handled by moving focus here, not by a live region — the
 * toast below is already one, and two would say it twice. Focus has to move
 * regardless: a screen reader user who just submitted is otherwise parked on a
 * button that no longer exists.
 */
function Joined({ email }: { email: string }) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    ref.current?.focus();
    toast.success("Check your inbox", {
      description: "Press the button in our email to confirm your place.",
    });
  }, []);

  return (
    <div
      ref={ref}
      tabIndex={-1}
      aria-labelledby="waitlist-joined"
      className="card-hairline brand-glow animate-rise mt-8 flex items-start gap-4 p-5 focus:outline-none"
    >
      <span className="mt-0.5 shrink-0 rounded-full bg-hit-dim p-2 text-hit">
        <Check className="size-5" aria-hidden="true" />
      </span>

      <div className="min-w-0">
        <h2
          id="waitlist-joined"
          className="text-base font-semibold tracking-tight text-fg"
        >
          Check your inbox
        </h2>

        <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">
          {email ? (
            <>
              We&rsquo;ve sent a link to{" "}
              {/* Breaks only when an address genuinely will not fit, rather
                  than mid-word on every wrap. */}
              <span className="break-words font-medium text-fg">{email}</span>. Press the
              button in it to confirm your place &mdash; until you do, you&rsquo;re not on the
              list.
            </>
          ) : (
            <>
              We&rsquo;ve sent you a link. Press the button in it to confirm your place
              &mdash; until you do, you&rsquo;re not on the list.
            </>
          )}
        </p>
      </div>
    </div>
  );
}
