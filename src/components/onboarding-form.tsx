"use client";

import * as React from "react";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Reveal } from "@/components/ui/motion";
import { cn } from "@/lib/utils";
import { acceptInviteAction } from "@/app/actions/invite";
import { SPEND_BAND_LABELS, spendBandValues } from "@/lib/validation";
import type { ActionState } from "@/lib/validation";

type Step = 1 | 2 | 3 | 4;

const STEP_TITLES: Record<Step, string> = {
  1: "You're in",
  2: "Set a password",
  3: "A couple details",
  4: "Last thing",
};

/** Which step owns each field, so a server-side field error jumps back there. */
const FIELD_STEP: Record<string, Step> = {
  email: 1,
  password: 2,
  confirm: 2,
  name: 3,
  phone: 3,
  spendBand: 4,
};

function FieldError({ message, id }: { message?: string; id: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 text-xs text-miss">
      {message}
    </p>
  );
}

export function OnboardingForm({ email, token }: { email: string; token: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(acceptInviteAction, null);
  const [step, setStep] = React.useState<Step>(1);
  const [clientError, setClientError] = React.useState<{ field: string; message: string } | null>(null);
  const formRef = React.useRef<HTMLFormElement>(null);
  const headingRef = React.useRef<HTMLHeadingElement>(null);

  const serverFieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  // Render-phase reset (not an effect) so jumping back to the errored step
  // happens in the same render the new state arrives in, matching the
  // pattern in pick-composer.tsx.
  const [lastHandledState, setLastHandledState] = React.useState(state);
  if (state !== lastHandledState) {
    setLastHandledState(state);
    const firstField = serverFieldErrors ? Object.keys(serverFieldErrors)[0] : undefined;
    const target = firstField ? FIELD_STEP[firstField] : undefined;
    if (target) setStep(target);
  }

  React.useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  function fieldValue(name: string): string {
    const el = formRef.current?.elements.namedItem(name);
    return el instanceof HTMLInputElement ? el.value : "";
  }

  function errorFor(field: string): string | undefined {
    if (clientError?.field === field) return clientError.message;
    return serverFieldErrors?.[field]?.[0];
  }

  function handleContinue() {
    if (step === 2) {
      const password = fieldValue("password");
      const confirm = fieldValue("confirm");
      if (password.length < 8) {
        setClientError({ field: "password", message: "At least 8 characters" });
        return;
      }
      if (password !== confirm) {
        setClientError({ field: "confirm", message: "Passwords don't match" });
        return;
      }
    }
    if (step === 3) {
      const name = fieldValue("name").trim();
      const phone = fieldValue("phone").trim();
      if (!name) {
        setClientError({ field: "name", message: "Enter your name" });
        return;
      }
      if (!phone) {
        setClientError({ field: "phone", message: "Enter a phone number" });
        return;
      }
    }
    setClientError(null);
    setStep((s) => (s < 4 ? ((s + 1) as Step) : s));
  }

  function handleBack() {
    setClientError(null);
    setStep((s) => (s > 1 ? ((s - 1) as Step) : s));
  }

  return (
    <Reveal>
      <div className="flex gap-1.5" aria-hidden="true">
        {([1, 2, 3, 4] as const).map((i) => (
          <div
            key={i}
            className={cn("h-1 flex-1 rounded-full transition-colors", i <= step ? "bg-brand" : "bg-border")}
          />
        ))}
      </div>

      <h1
        ref={headingRef}
        tabIndex={-1}
        className="mt-6 text-2xl font-semibold tracking-tight outline-none"
      >
        {STEP_TITLES[step]}
      </h1>

      {state && !state.ok && !state.fieldErrors && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-miss/30 bg-miss-dim px-4 py-3 text-sm text-miss"
        >
          {state.error}
        </p>
      )}

      <form ref={formRef} action={action} className="mt-6">
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="token" value={token} />

        {/* --------------------------------------------------------- step 1 */}
        <div className={step === 1 ? "space-y-4" : "hidden"}>
          <p className="text-sm text-fg-muted">
            You&apos;ve been invited to oobee bets. This link is tied to one email address.
          </p>
          <div>
            <Label>Email</Label>
            <p className="mt-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg">
              {email}
            </p>
          </div>
        </div>

        {/* --------------------------------------------------------- step 2 */}
        <div className={step === 2 ? "space-y-4" : "hidden"}>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              className="mt-1.5"
              aria-invalid={Boolean(errorFor("password"))}
              aria-describedby={errorFor("password") ? "password-error" : "password-hint"}
            />
            {errorFor("password") ? (
              <FieldError id="password-error" message={errorFor("password")} />
            ) : (
              <p id="password-hint" className="mt-1.5 text-xs text-fg-subtle">
                At least 8 characters.
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="confirm">Confirm password</Label>
            <Input
              id="confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              className="mt-1.5"
              aria-invalid={Boolean(errorFor("confirm"))}
              aria-describedby={errorFor("confirm") ? "confirm-error" : undefined}
            />
            <FieldError id="confirm-error" message={errorFor("confirm")} />
          </div>
        </div>

        {/* --------------------------------------------------------- step 3 */}
        <div className={step === 3 ? "space-y-4" : "hidden"}>
          <div>
            <Label htmlFor="name">Full name</Label>
            <Input
              id="name"
              name="name"
              autoComplete="name"
              className="mt-1.5"
              aria-invalid={Boolean(errorFor("name"))}
              aria-describedby={errorFor("name") ? "name-error" : undefined}
            />
            <FieldError id="name-error" message={errorFor("name")} />
          </div>
          <div>
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              className="mt-1.5"
              aria-invalid={Boolean(errorFor("phone"))}
              aria-describedby={errorFor("phone") ? "phone-error" : undefined}
            />
            <FieldError id="phone-error" message={errorFor("phone")} />
          </div>
        </div>

        {/* --------------------------------------------------------- step 4 */}
        <div className={step === 4 ? "space-y-4" : "hidden"}>
          <fieldset>
            <legend className="text-sm text-fg-muted">
              How much do you typically spend on sports betting a month?
            </legend>
            <div className="mt-4 grid gap-2">
              {spendBandValues.map((value) => (
                <label
                  key={value}
                  className="flex cursor-pointer items-center rounded-lg border border-border bg-surface px-4 py-3 text-sm text-fg transition-colors has-[:checked]:border-brand/60 has-[:checked]:bg-brand/5 hover:border-border-strong"
                >
                  <input
                    type="radio"
                    name="spendBand"
                    value={value}
                    required
                    className="peer sr-only"
                  />
                  <span>{SPEND_BAND_LABELS[value]}</span>
                  <span
                    className="ml-auto size-4 shrink-0 rounded-full border border-border-strong peer-checked:border-brand peer-checked:bg-brand"
                    aria-hidden="true"
                  />
                </label>
              ))}
            </div>
          </fieldset>
          <FieldError id="spendBand-error" message={errorFor("spendBand")} />
        </div>

        {/* ------------------------------------------------------------ nav */}
        <div className="mt-8 flex items-center justify-between gap-3">
          {step > 1 ? (
            <Button type="button" variant="ghost" onClick={handleBack}>
              Back
            </Button>
          ) : (
            <span />
          )}

          {step < 4 ? (
            // `key` forces a fresh DOM node rather than React patching this
            // one's `type` in place. Without it, the click that advances to
            // step 4 lands on a node React has already flipped to
            // type="submit" by the time the browser runs the click's default
            // action — turning "Continue" into a surprise, premature submit.
            <Button key="continue" type="button" onClick={handleContinue}>
              Continue
            </Button>
          ) : (
            <Button key="submit" type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
              Finish
            </Button>
          )}
        </div>
      </form>
    </Reveal>
  );
}
