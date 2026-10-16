"use client";

import * as React from "react";
import { useActionState } from "react";
import { ArrowRight, Check, ListPlus, Loader2 } from "lucide-react";
import { getStartedAction } from "@/app/actions/waitlist";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/lib/validation";

/**
 * One email field: "Join waitlist" while sign-ups are closed, "Sign up" once
 * SIGNUP_ENABLED is on. The landing page and /signup both use it; `source`
 * only records which.
 */
export function GetStartedForm({ open, source }: { open: boolean; source: "landing" | "signup" }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(getStartedAction, null);
  // Controlled so the confirmation can name the address back — it's what
  // catches a typo while the visitor still cares.
  const [email, setEmail] = React.useState("");

  if (state?.ok) return <Done email={email} open={open} message={state.message} />;

  const errorId = state && !state.ok ? `get-started-error-${source}` : undefined;
  const inputId = `get-started-email-${source}`;

  return (
    <form action={action}>
      <input type="hidden" name="source" value={source} />
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1">
          <Label htmlFor={inputId} className="sr-only">
            Email address
          </Label>
          <Input
            id={inputId}
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
        <Button type="submit" size="lg" className="h-12" disabled={pending}>
          {pending ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : open ? (
            <ArrowRight aria-hidden="true" />
          ) : (
            <ListPlus aria-hidden="true" />
          )}
          {open ? "Sign up" : "Join waitlist"}
        </Button>
      </div>

      {errorId && (
        <p id={errorId} role="alert" className="mt-3 text-sm text-miss">
          {state && !state.ok ? state.error : null}
        </p>
      )}

      <p className="mt-3 text-xs leading-relaxed text-fg-subtle">
        {open
          ? "We'll email you a link to finish creating your account. 21+ only."
          : "One email the day sign-ups open, and nothing before it. No picks, no spam, leave any time."}
      </p>
    </form>
  );
}

/**
 * Replaces the form rather than stacking a message under it — a live field
 * below "done" invites a second submission. Focus moves here so a screen
 * reader isn't left on a button that no longer exists.
 */
function Done({ email, open, message }: { email: string; open: boolean; message?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => ref.current?.focus(), []);

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="status"
      className="card-hairline brand-glow animate-rise flex items-start gap-4 p-5 focus:outline-none"
    >
      <span className="mt-0.5 shrink-0 rounded-full bg-hit-dim p-2 text-hit">
        <Check className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <h2 className="text-base font-semibold tracking-tight text-fg">
          {open ? "Check your inbox" : "You're on the list"}
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">
          {email && (
            <>
              Sent to <span className="break-words font-medium text-fg">{email}</span>.{" "}
            </>
          )}
          {message}
        </p>
      </div>
    </div>
  );
}
