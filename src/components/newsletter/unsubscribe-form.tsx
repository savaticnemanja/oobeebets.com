"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { Loader2, MailMinus } from "lucide-react";
import { unsubscribeAction } from "@/app/actions/newsletter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * `token` comes from the link in the email footer. Without one — someone who
 * found this page on their own, or whose link has been rotated by a
 * resubscribe — the form falls back to asking for the address.
 */
export function UnsubscribeForm({ token }: { token?: string }) {
  const [state, formAction, pending] = useActionState(unsubscribeAction, null);

  if (state?.ok) return <Unsubscribed />;

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
    <form action={formAction}>
      {useToken ? (
        <>
          <input type="hidden" name="token" value={token ?? ""} />
          {/* The page above already says what this does. The one thing worth
              repeating next to the button is what gets lost with it. */}
          <p className="text-sm leading-relaxed text-fg-muted">
            This includes the launch announcement &mdash; the one email most people
            joined for.
          </p>
        </>
      ) : (
        <div>
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
        Unsubscribe
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
        That address is off the list, and you won&rsquo;t hear from us again &mdash;
        including on launch day.
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
