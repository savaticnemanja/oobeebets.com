"use client";

import * as React from "react";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { isValidPhoneNumber, type CountryCode } from "libphonenumber-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneField, toE164 } from "@/components/phone-field";
import { Reveal } from "@/components/ui/motion";
import { cn } from "@/lib/utils";
import { HelpLine } from "@/components/help-line";
import { acceptInviteAction } from "@/app/actions/invite";
import { Field as SurveyField, SurveyQuestions } from "@/components/get-started-form";
import { nameSchema, passwordSchema, SPEND_BAND_LABELS, spendBandValues } from "@/lib/validation";
import type { ActionState } from "@/lib/validation";

type Step = 1 | 2 | 3 | 4;
type Field = "password" | "confirm" | "name" | "phone" | "spendBand" | "agree";

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
  agree: 4,
};

const STEP_FIELDS: Record<Step, Field[]> = {
  1: [],
  2: ["password", "confirm"],
  3: ["name", "phone"],
  4: ["spendBand", "agree"],
};

/** The spend question's "Prefer not to say" — posted as no answer. */
const SKIP = "skip" as const;

type Values = {
  password: string;
  confirm: string;
  name: string;
  country: CountryCode;
  phone: string;
  spendBand: string;
  agree: boolean;
};

const EMPTY: Values = {
  password: "",
  confirm: "",
  name: "",
  country: "US",
  phone: "",
  spendBand: "",
  agree: false,
};

/** The number is validated against the selected country's own numbering
 * plan, so a plausible-looking but impossible number is caught here rather
 * than becoming an unreachable contact. */
function validate(field: Field, v: Values): string | undefined {
  switch (field) {
    case "password": {
      const parsed = passwordSchema.safeParse(v.password);
      return parsed.success ? undefined : parsed.error.issues[0]?.message;
    }
    case "confirm":
      if (!v.confirm) return "Confirm your password";
      return v.confirm === v.password ? undefined : "Passwords don't match";
    case "name": {
      const parsed = nameSchema.safeParse(v.name);
      return parsed.success ? undefined : parsed.error.issues[0]?.message;
    }
    case "phone": {
      if (!v.phone.trim()) return undefined;
      return isValidPhoneNumber(v.phone, v.country)
        ? undefined
        : "That doesn't look like a valid number for that country";
    }
    case "spendBand":
      return undefined;
    case "agree":
      return v.agree ? undefined : "Confirm you're 21 or older and accept the Terms to finish";
  }
}

function FieldError({ message, id }: { message?: string; id: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 text-xs text-miss">
      {message}
    </p>
  );
}

export function OnboardingForm({
  email,
  token,
  selfServe,
  needsSurvey,
}: {
  email: string;
  token: string;
  selfServe: boolean;
  /** Asked here when the address never answered the application on /signup. */
  needsSurvey: boolean;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(acceptInviteAction, null);
  const [step, setStep] = React.useState<Step>(1);

  // Every field is controlled, so a failed submit can't take the answers with
  // it — React resets an uncontrolled form once its action settles, which is
  // what used to wipe the steps the tester had already filled in.
  const [values, setValues] = React.useState<Values>(EMPTY);
  // A field's error only shows once it's been blurred or a step was
  // advanced past it; after that it re-validates on every keystroke.
  const [touched, setTouched] = React.useState<Partial<Record<Field, boolean>>>({});
  const headingRef = React.useRef<HTMLHeadingElement>(null);

  const serverFieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  // Render-phase reset (not an effect) so jumping back to the errored step
  // happens in the same render the new state arrives in, matching the
  // pattern in pick-composer.tsx.
  const [lastHandledState, setLastHandledState] = React.useState(state);
  if (state !== lastHandledState) {
    setLastHandledState(state);
    const firstField = serverFieldErrors ? Object.keys(serverFieldErrors)[0] : undefined;
    const target = firstField ? (FIELD_STEP[firstField] ?? 3) : undefined;
    if (target) setStep(target);
  }

  React.useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  function setField<K extends keyof Values>(field: K, value: Values[K]) {
    setValues((v) => ({ ...v, [field]: value }));
  }

  function markTouched(field: Field) {
    setTouched((t) => ({ ...t, [field]: true }));
  }

  function errorFor(field: Field): string | undefined {
    if (touched[field]) {
      const message = validate(field, values);
      if (message) return message;
      // A live-valid field shouldn't keep showing the server's complaint.
      return undefined;
    }
    return serverFieldErrors?.[field]?.[0];
  }

  function handleContinue() {
    const fields = STEP_FIELDS[step];
    setTouched((t) => ({ ...t, ...Object.fromEntries(fields.map((f) => [f, true])) }));
    if (fields.some((f) => validate(f, values))) return;
    setStep((s) => (s < 4 ? ((s + 1) as Step) : s));
  }

  function handleBack() {
    setStep((s) => (s > 1 ? ((s - 1) as Step) : s));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    const fields: Field[] = ["password", "confirm", "name", "phone", "spendBand", "agree"];
    setTouched(Object.fromEntries(fields.map((f) => [f, true])));
    const firstBad = fields.find((f) => validate(f, values));
    // Submitted by hand: the survey's inputs are uncontrolled, and a form
    // action would reset them when a submission comes back refused.
    e.preventDefault();
    if (firstBad) {
      setStep(FIELD_STEP[firstBad]);
      return;
    }
    const data = new FormData(e.currentTarget);
    React.startTransition(() => action(data));
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

      <form onSubmit={handleSubmit} noValidate className="mt-6">
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="token" value={token} />
        {/* E.164 is what the server stores; the formatted national number is
            only ever a display concern. */}
        <input type="hidden" name="phone" value={toE164(values.country, values.phone) ?? values.phone.trim()} />
        <input type="hidden" name="spendBand" value={values.spendBand === SKIP ? "" : values.spendBand} />
        <input type="hidden" name="agree" value={values.agree ? "yes" : ""} />

        {/* --------------------------------------------------------- step 1 */}
        <div className={step === 1 ? "space-y-4" : "hidden"}>
          <p className="text-sm text-fg-muted">
            {selfServe
              ? "You're creating an oobee bets account. This link is tied to one email address."
              : "You've been invited to oobee bets. This link is tied to one email address."}
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
              value={values.password}
              onChange={(e) => setField("password", e.target.value)}
              onBlur={() => markTouched("password")}
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
              value={values.confirm}
              onChange={(e) => setField("confirm", e.target.value)}
              onBlur={() => markTouched("confirm")}
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
            <Label htmlFor="name">Display name</Label>
            <Input
              id="name"
              name="name"
              autoComplete="nickname"
              value={values.name}
              onChange={(e) => setField("name", e.target.value)}
              onBlur={() => markTouched("name")}
              className="mt-1.5"
              aria-invalid={Boolean(errorFor("name"))}
              aria-describedby={errorFor("name") ? "name-error" : "name-hint"}
            />
            {errorFor("name") ? (
              <FieldError id="name-error" message={errorFor("name")} />
            ) : (
              // It becomes the public name on posts and the profile, and seeds
              // the @handle — which used to happen without a word.
              <p id="name-hint" className="mt-1.5 text-xs text-fg-subtle">
                Shown on your profile and posts, so it doesn&apos;t have to be your real name. You
                can change it, and your @handle, in your account.
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="phone-local">
              Phone <span className="font-normal text-fg-subtle">(optional)</span>
            </Label>
            <div className="mt-1.5">
              <PhoneField
                id="phone-local"
                country={values.country}
                onCountryChange={(c) => setField("country", c)}
                value={values.phone}
                onValueChange={(v) => setField("phone", v)}
                onBlur={() => markTouched("phone")}
                invalid={Boolean(errorFor("phone"))}
                describedBy={errorFor("phone") ? "phone-error" : "phone-hint"}
              />
            </div>
            {errorFor("phone") ? (
              <FieldError id="phone-error" message={errorFor("phone")} />
            ) : (
              <p id="phone-hint" className="mt-1.5 text-xs text-fg-subtle">
                Only for reaching you about your account. Never shown to anyone.
              </p>
            )}
          </div>
          {needsSurvey && (
            <div className="space-y-7 border-t border-border pt-6">
              <p className="text-sm text-fg-muted">A few questions about how you bet, for the beta.</p>
              <SurveyField label="First and last name" name="fullName" autoComplete="name" error={serverFieldErrors?.fullName?.[0]} />
              <SurveyQuestions err={(k) => serverFieldErrors?.[k]?.[0]} />
            </div>
          )}
        </div>

        {/* --------------------------------------------------------- step 4 */}
        <div className={step === 4 ? "space-y-4" : "hidden"}>
          <fieldset>
            <legend className="text-sm text-fg-muted">
              How much do you typically spend on sports betting a month?{" "}
              <span className="text-fg-subtle">(optional)</span>
            </legend>
            <p className="mt-1 text-xs text-fg-subtle">
              Never shown to anyone — it helps us understand who&apos;s testing.
            </p>
            <div className="mt-4 grid gap-2">
              {([...spendBandValues, SKIP] as const).map((value) => (
                <label
                  key={value}
                  className="flex cursor-pointer items-center rounded-lg border border-border bg-surface px-4 py-3 text-sm text-fg transition-colors has-[:checked]:border-brand/60 has-[:checked]:bg-brand/5 hover:border-border-strong"
                >
                  <input
                    type="radio"
                    name="spendBandChoice"
                    value={value}
                    checked={values.spendBand === value}
                    onChange={() => {
                      setField("spendBand", value);
                      markTouched("spendBand");
                    }}
                    className="peer sr-only"
                  />
                  <span>{value === SKIP ? "Prefer not to say" : SPEND_BAND_LABELS[value]}</span>
                  <span
                    className="ml-auto size-4 shrink-0 rounded-full border border-border-strong peer-checked:border-brand peer-checked:bg-brand"
                    aria-hidden="true"
                  />
                </label>
              ))}
            </div>
          </fieldset>
          <FieldError id="spendBand-error" message={errorFor("spendBand")} />
          {/* Right where someone has just told us how much they spend. */}
          <p className="text-xs text-fg-subtle">
            <HelpLine />
          </p>

          {/* Opens in a new tab: following it here would leave the wizard
              and lose the answers above. */}
          <label className="flex cursor-pointer items-start gap-3 pt-2 text-sm text-fg-muted">
            <input
              type="checkbox"
              name="agreeChoice"
              checked={values.agree}
              onChange={(e) => {
                setField("agree", e.target.checked);
                markTouched("agree");
              }}
              aria-invalid={Boolean(errorFor("agree"))}
              aria-describedby={errorFor("agree") ? "agree-error" : undefined}
              className="mt-0.5 size-4 shrink-0 accent-[var(--color-brand)]"
            />
            <span>
              I&apos;m 21 or older and allowed to bet on sports where I live, and I accept the{" "}
              <a href="/legal/terms" target="_blank" rel="noopener" className="text-brand hover:underline">
                Terms
              </a>{" "}
              and{" "}
              <a href="/legal/privacy" target="_blank" rel="noopener" className="text-brand hover:underline">
                Privacy Policy
              </a>
              .
            </span>
          </label>
          <FieldError id="agree-error" message={errorFor("agree")} />
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
