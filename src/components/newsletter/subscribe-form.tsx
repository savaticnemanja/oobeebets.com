"use client";

import * as React from "react";
import { useActionState } from "react";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { subscribeAction } from "@/app/actions/newsletter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SubscribeForm() {
  const [state, formAction, pending] = useActionState(subscribeAction, null);

  if (state?.ok) return <Subscribed />;

  const errorId = state && !state.ok ? "newsletter-error" : undefined;

  return (
    <form action={formAction} className="mt-8">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1">
          <Label htmlFor="newsletter-email" className="sr-only">
            Email address
          </Label>
          <Input
            id="newsletter-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
            className="h-12 sm:text-base"
            aria-invalid={Boolean(errorId)}
            aria-describedby={errorId}
          />
        </div>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <ArrowRight aria-hidden="true" />
          )}
          Notify me
        </Button>
      </div>

      {errorId && (
        <p id={errorId} role="alert" className="mt-3 text-sm text-miss">
          {state && !state.ok ? state.error : null}
        </p>
      )}

      <p className="mt-3 text-xs leading-relaxed text-fg-subtle">
        One email when we launch, and the occasional note before then. No picks, no
        spam, unsubscribe in one click.
      </p>
    </form>
  );
}

/**
 * Replaces the form outright rather than sitting beside it — there is nothing
 * left to do here, and leaving a live field under a success message invites a
 * second submission.
 *
 * Takes focus on mount because that replacement is what makes it reachable: a
 * screen reader user who just submitted is left on a button that no longer
 * exists, and `role="status"` alone announces the text without moving them to
 * it.
 */
function Subscribed() {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="status"
      className="card-hairline brand-glow mt-8 p-6 focus:outline-none sm:p-7"
    >
      <CheckCircle2 className="size-6 text-hit" aria-hidden="true" />

      <h2 className="mt-4 text-xl font-semibold tracking-tight text-fg">
        Thank you for subscribing to oobee bets!
      </h2>

      <p className="mt-3 text-sm leading-relaxed text-fg-muted">
        Please check your email for welcome messages, official launch notification and
        new things coming to our platform.
      </p>

      <p className="mt-3 text-sm leading-relaxed text-fg-muted">
        We appreciate you joining the oobee bets family!
      </p>

      <p className="mt-5 text-base font-semibold tracking-tight text-brand">
        Let&rsquo;s beat the books
      </p>
    </div>
  );
}
