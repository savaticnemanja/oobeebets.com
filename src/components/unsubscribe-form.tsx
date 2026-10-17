"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { Loader2, MailCheck, MailMinus } from "lucide-react";
import { unsubscribeAction } from "@/app/actions/waitlist";
import { SpamGuardFields } from "@/components/spam-guard-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * `token` comes from an unsubscribe link in one of our emails. Without one —
 * someone who found this page on their own — the form asks for the address
 * and mails it its own link (so nobody can unsubscribe a stranger); that path
 * carries the public forms' bot checks, since it sends email.
 */
export function UnsubscribeForm({ token, formToken }: { token?: string; formToken: string }) {
  const [state, formAction, pending] = useActionState(unsubscribeAction, null);
  // Which path the success came from: the token acts at once, the address only sends a link.
  const [sentLink, setSentLink] = React.useState(false);

  if (state?.ok) return sentLink ? <LinkSent message={state.message} /> : <Unsubscribed />;

  const errorId = state && !state.ok ? "unsubscribe-error" : undefined;

  // A link that has just failed is a link worth abandoning. Whatever went
  // wrong — a truncated URL, an id that matches nothing any more — pressing
  // the same button again repeats it, so the form drops the token and asks for
  // the address instead, which is the one route that needs nothing from the
  // email.
  const useToken = Boolean(token) && !errorId;

  return (
    // No top margin: the card is the spacing now that the heading has moved out
    // to the page.
    <form action={formAction} onSubmit={() => setSentLink(!useToken)}>
      {useToken ? (
        <>
          <input type="hidden" name="token" value={token ?? ""} />
          {/* The page above already says what this does. The one thing worth
              repeating next to the button is what gets lost with it. */}
          <p className="text-sm leading-relaxed text-fg-muted">
            This includes the email the day there&rsquo;s a place for you &mdash; the one
            most people joined for.
          </p>
        </>
      ) : (
        <div>
          <SpamGuardFields token={formToken} />
          <Label htmlFor="unsubscribe-email">Email address</Label>
          <Input
            id="unsubscribe-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
            className="mt-1.5"
            aria-invalid={Boolean(errorId)}
            aria-describedby={errorId}
          />
        </div>
      )}

      {errorId && (
        <p id={errorId} role="alert" className="mt-3 text-sm text-miss">
          {state && !state.ok ? state.error : null}
        </p>
      )}

      <Button type="submit" variant="subtle" disabled={pending} className="mt-5 w-full">
        {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
        {useToken ? "Unsubscribe" : "Email me a link"}
      </Button>
    </form>
  );
}

/**
 * Same message whether or not the address was on the list. Telling a stranger
 * "that email is not subscribed" turns this page into a way to test who is.
 */
function Unsubscribed() {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div ref={ref} tabIndex={-1} role="status" className="focus:outline-none">
      <span className="inline-flex rounded-full border border-border bg-surface p-2.5 text-fg-muted">
        <MailMinus className="size-5" aria-hidden="true" />
      </span>

      <h2 className="mt-4 text-lg font-semibold tracking-tight text-fg">
        You&rsquo;re unsubscribed
      </h2>

      <p className="mt-2 text-sm leading-relaxed text-fg-muted">
        That address is off the waitlist and the newsletter, and you won&rsquo;t hear
        from us again.
      </p>

      <p className="mt-4 text-sm leading-relaxed text-fg-muted">
        Changed your mind?{" "}
        <Link href="/" className="text-brand underline-offset-4 hover:underline">
          Sign back up
        </Link>
        .
      </p>
    </div>
  );
}

/** The typed-address path: same words whether or not the address is on the list. */
function LinkSent({ message }: { message?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => ref.current?.focus(), []);
  return (
    <div ref={ref} tabIndex={-1} role="status" className="focus:outline-none">
      <span className="inline-flex rounded-full border border-border bg-surface p-2.5 text-fg-muted">
        <MailCheck className="size-5" aria-hidden="true" />
      </span>
      <h2 className="mt-4 text-lg font-semibold tracking-tight text-fg">Check your inbox</h2>
      <p className="mt-2 text-sm leading-relaxed text-fg-muted">{message}</p>
    </div>
  );
}
