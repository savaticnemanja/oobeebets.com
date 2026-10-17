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
import { acceptInviteAction } from "@/app/actions/invite";
import {
  BETA_FIELDS,
  BETTING_FIELDS,
  BetaQuestions,
  BettingQuestions,
  checkSurvey,
  focusFirstError,
  surveyErrorsFrom,
  useSurvey,
  type SurveyErrors,
} from "@/components/signup-survey";
import { appendSurvey, type SurveyField } from "@/lib/signup-survey";
import { nameSchema, passwordSchema } from "@/lib/validation";
import type { ActionState } from "@/lib/validation";

/**
 * The invite wizard. Someone who came through /signup has answered the beta
 * application already and gets four steps; someone an admin invited directly
 * answers it here, over two extra steps, so it's asked of every tester once.
 */
type Step = "intro" | "password" | "profile" | "betting" | "last";
type Field = "password" | "confirm" | "name" | "phone" | "agree";

const STEP_FIELDS: Record<Step, Field[]> = {
  intro: [],
  password: ["password", "confirm"],
  profile: ["name", "phone"],
  betting: [],
  last: ["agree"],
};

/** The survey's questions by step — only asked when `needsSurvey`. */
const SURVEY_STEP_FIELDS: Record<Step, readonly SurveyField[]> = {
  intro: [],
  password: [],
  profile: ["fullName"],
  betting: BETTING_FIELDS,
  last: BETA_FIELDS,
};

function stepTitle(step: Step, needsSurvey: boolean): string {
  switch (step) {
    case "intro":
      return "You're in";
    case "password":
      return "Set a password";
    case "profile":
      return "Your profile";
    case "betting":
      return "How you bet";
    case "last":
      return needsSurvey ? "The beta" : "Last thing";
  }
}

type Values = {
  password: string;
  confirm: string;
  name: string;
  country: CountryCode;
  phone: string;
  agree: boolean;
};

const EMPTY: Values = {
  password: "",
  confirm: "",
  name: "",
  country: "US",
  phone: "",
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
  const steps: Step[] = needsSurvey
    ? ["intro", "password", "profile", "betting", "last"]
    : ["intro", "password", "profile", "last"];
  const [index, setIndex] = React.useState(0);
  const step = steps[index];
  const isLast = index === steps.length - 1;

  // Every field is controlled, so a failed submit can't take the answers with
  // it — React resets an uncontrolled form once its action settles, which is
  // what used to wipe the steps the tester had already filled in.
  const [values, setValues] = React.useState<Values>(EMPTY);
  // The Terms box on the last step is where an invited tester confirms age.
  const survey = useSurvey({ is21: "yes" });
  // A field's error only shows once it's been blurred or a step was
  // advanced past it; after that it re-validates on every keystroke.
  const [touched, setTouched] = React.useState<Partial<Record<Field, boolean>>>({});
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  // Survey errors to focus once their step is on screen (a hidden step's
  // inputs can't take focus).
  const focusAfterStep = React.useRef<SurveyErrors | null>(null);

  const serverFieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  function stepOf(field: string): Step | undefined {
    if (field === "email") return "intro";
    return steps.find(
      (s) => (STEP_FIELDS[s] as string[]).includes(field) || (SURVEY_STEP_FIELDS[s] as readonly string[]).includes(field),
    );
  }

  function goTo(target: Step, focus?: SurveyErrors) {
    focusAfterStep.current = focus ?? null;
    setIndex(steps.indexOf(target));
  }

  // Render-phase reset (not an effect) so jumping back to the errored step
  // happens in the same render the new state arrives in, matching the
  // pattern in pick-composer.tsx.
  const [lastHandledState, setLastHandledState] = React.useState(state);
  if (state !== lastHandledState) {
    setLastHandledState(state);
    if (serverFieldErrors) {
      const surveyErrors = surveyErrorsFrom(serverFieldErrors);
      survey.setErrors(surveyErrors);
      const target = steps.find((s) => Object.keys(serverFieldErrors).some((k) => stepOf(k) === s));
      if (target) setIndex(steps.indexOf(target));
    }
  }

  React.useEffect(() => {
    const pendingFocus = focusAfterStep.current;
    focusAfterStep.current = null;
    if (pendingFocus && Object.keys(pendingFocus).length > 0) focusFirstError(pendingFocus);
    else headingRef.current?.focus();
  }, [index]);

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

  function surveyErrorsOn(s: Step): SurveyErrors {
    return needsSurvey ? checkSurvey(survey.values, SURVEY_STEP_FIELDS[s]) : {};
  }

  function handleContinue() {
    const fields = STEP_FIELDS[step];
    setTouched((t) => ({ ...t, ...Object.fromEntries(fields.map((f) => [f, true])) }));
    const surveyErrors = surveyErrorsOn(step);
    survey.setErrors(surveyErrors);
    if (fields.some((f) => validate(f, values))) return;
    if (Object.keys(surveyErrors).length > 0) {
      focusFirstError(surveyErrors);
      return;
    }
    setIndex((i) => Math.min(i + 1, steps.length - 1));
  }

  function handleBack() {
    setIndex((i) => Math.max(i - 1, 0));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    // Submitted by hand: a form action would reset the form when a
    // submission comes back refused.
    e.preventDefault();
    const fields: Field[] = ["password", "confirm", "name", "phone", "agree"];
    setTouched(Object.fromEntries(fields.map((f) => [f, true])));
    const surveyErrors = needsSurvey
      ? checkSurvey(survey.values, steps.flatMap((s) => SURVEY_STEP_FIELDS[s]))
      : {};
    survey.setErrors(surveyErrors);
    const firstBad = steps.find(
      (s) => STEP_FIELDS[s].some((f) => validate(f, values)) || SURVEY_STEP_FIELDS[s].some((k) => surveyErrors[k]),
    );
    if (firstBad) {
      if (firstBad === step) focusFirstError(surveyErrors);
      else goTo(firstBad, surveyErrors);
      return;
    }
    const data = new FormData(e.currentTarget);
    if (needsSurvey) appendSurvey(data, { ...survey.values, email });
    React.startTransition(() => action(data));
  }

  const fullNameError = survey.errors.fullName;

  return (
    <Reveal>
      <div className="flex gap-1.5" aria-hidden="true">
        {steps.map((s, i) => (
          <div key={s} className={cn("h-1 flex-1 rounded-full transition-colors", i <= index ? "bg-brand" : "bg-border")} />
        ))}
      </div>

      <h1
        ref={headingRef}
        tabIndex={-1}
        className="mt-6 text-2xl font-semibold tracking-tight outline-none"
      >
        {stepTitle(step, needsSurvey)}
      </h1>
      <p className="mt-1 text-xs text-fg-subtle">
        Step {index + 1} of {steps.length}
      </p>

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
        <input type="hidden" name="agree" value={values.agree ? "yes" : ""} />

        {/* ---------------------------------------------------------- intro */}
        <div className={step === "intro" ? "space-y-4" : "hidden"}>
          <p className="text-sm text-fg-muted">
            {selfServe
              ? "You're creating an oobee bets account. This link is tied to one email address."
              : "You've been invited to oobee bets. This link is tied to one email address."}
          </p>
          {needsSurvey && (
            <p className="text-sm text-fg-muted">
              It takes about three minutes: a password, your profile, and a few questions about how
              you bet so we know who&apos;s testing.
            </p>
          )}
          <div>
            <Label>Email</Label>
            <p className="mt-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg">
              {email}
            </p>
          </div>
        </div>

        {/* ------------------------------------------------------- password */}
        <div className={step === "password" ? "space-y-4" : "hidden"}>
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

        {/* -------------------------------------------------------- profile */}
        <div className={step === "profile" ? "space-y-4" : "hidden"}>
          {needsSurvey && (
            // The real name, private — beside the public display name below,
            // so the two can't be mistaken for each other.
            <div>
              <Label htmlFor="survey-fullName">First and last name</Label>
              <Input
                id="survey-fullName"
                name="q-fullName"
                autoComplete="name"
                maxLength={120}
                value={survey.values.fullName}
                onChange={(e) => survey.set("fullName", e.target.value)}
                className="mt-1.5"
                aria-invalid={Boolean(fullNameError)}
                aria-describedby={fullNameError ? "survey-fullName-error" : "survey-fullName-hint"}
              />
              {fullNameError ? (
                <FieldError id="survey-fullName-error" message={fullNameError} />
              ) : (
                <p id="survey-fullName-hint" className="mt-1.5 text-xs text-fg-subtle">
                  Private — only the oobee bets team sees it.
                </p>
              )}
            </div>
          )}
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
        </div>

        {/* -------------------------------------------------------- betting */}
        {needsSurvey && (
          <div className={step === "betting" ? "space-y-8" : "hidden"}>
            <BettingQuestions survey={survey} />
          </div>
        )}

        {/* ----------------------------------------------------------- last */}
        <div className={step === "last" ? "space-y-8" : "hidden"}>
          {needsSurvey && <BetaQuestions survey={survey} />}

          {/* Opens in a new tab: following it here would leave the wizard
              and lose the answers above. */}
          <div>
            <label className="flex cursor-pointer items-start gap-3 text-sm text-fg-muted">
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
        </div>

        {/* ------------------------------------------------------------ nav */}
        <div className="mt-8 flex items-center justify-between gap-3">
          {index > 0 ? (
            <Button type="button" variant="ghost" onClick={handleBack}>
              Back
            </Button>
          ) : (
            <span />
          )}

          {!isLast ? (
            // `key` forces a fresh DOM node rather than React patching this
            // one's `type` in place. Without it, the click that advances to
            // the last step lands on a node React has already flipped to
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
