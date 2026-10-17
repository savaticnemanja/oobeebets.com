"use client";

import * as React from "react";
import { useActionState } from "react";
import { ArrowRight, Check, ListPlus, Loader2 } from "lucide-react";
import { getStartedAction } from "@/app/actions/waitlist";
import { Button } from "@/components/ui/button";
import {
  AgeQuestion,
  BetaQuestions,
  BettingQuestions,
  FullNameQuestion,
  SurveySection,
  TextQuestion,
  checkSurvey,
  focusFirstError,
  surveyErrorsFrom,
  useSurvey,
} from "@/components/signup-survey";
import { appendSurvey } from "@/lib/signup-survey";
import { HONEYPOT_FIELD, TOKEN_FIELD } from "@/lib/form-token";
import { SpamGuardFields } from "@/components/spam-guard-fields";
import type { ActionState } from "@/lib/validation";

/**
 * /signup: the beta application, then "Join waitlist" while sign-ups are
 * closed or "Sign up" once SIGNUP_ENABLED is on. Answers are kept in
 * signup_surveys. Age comes first, so someone under 21 learns it before
 * typing anything else.
 */
export function GetStartedForm({
  open,
  source,
  formToken,
  initialEmail = "",
}: {
  open: boolean;
  source: "landing" | "signup";
  /** From the page (issueFormToken) — see lib/spam-guard.ts. */
  formToken: string;
  /** /signup?email=… — the confirm page's "answer the questions" link. */
  initialEmail?: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(getStartedAction, null);
  const survey = useSurvey({ email: initialEmail });
  const { values, setErrors } = survey;

  // The server runs the same rules; anything it still refuses lands on the
  // same fields. Render-phase, like onboarding-form.tsx.
  const [handled, setHandled] = React.useState(state);
  if (state !== handled) {
    setHandled(state);
    if (state && !state.ok && state.fieldErrors) setErrors(surveyErrorsFrom(state.fieldErrors));
  }
  React.useEffect(() => {
    if (state && !state.ok && state.fieldErrors) focusFirstError(surveyErrorsFrom(state.fieldErrors));
  }, [state]);

  if (state?.ok) return <Done email={values.email} message={state.message} />;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const errors = checkSurvey(values);
    if (Object.keys(errors).length > 0) {
      setErrors(errors);
      focusFirstError(errors);
      return;
    }
    const data = new FormData();
    data.set("source", source);
    appendSurvey(data, values);
    // The bot checks' two hidden inputs ride along from the form itself.
    const dom = new FormData(e.currentTarget);
    data.set(TOKEN_FIELD, String(dom.get(TOKEN_FIELD) ?? ""));
    data.set(HONEYPOT_FIELD, String(dom.get(HONEYPOT_FIELD) ?? ""));
    React.startTransition(() => action(data));
  }

  const under21 = values.is21 === "no";
  const formError = state && !state.ok && !state.fieldErrors ? state.error : null;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-10">
      <SpamGuardFields token={formToken} />
      <AgeQuestion survey={survey} />

      {under21 ? (
        <p role="status" className="rounded-lg border border-border bg-surface px-4 py-3 text-sm text-fg-muted">
          Sorry — oobee bets is only for people 21 and older, so we can&apos;t take your sign-up.
        </p>
      ) : (
        <>
          <SurveySection title="About you">
            <FullNameQuestion survey={survey} hint="Only the oobee bets team sees this." />
            <TextQuestion survey={survey} field="email" label="Email address" type="email" autoComplete="email" placeholder="you@example.com" />
          </SurveySection>

          <SurveySection title="How you bet">
            <BettingQuestions survey={survey} />
          </SurveySection>

          <SurveySection title="The beta">
            <BetaQuestions survey={survey} />
          </SurveySection>

          <div>
            <Button type="submit" size="lg" className="h-12 w-full" disabled={pending}>
              {pending ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : open ? (
                <ArrowRight aria-hidden="true" />
              ) : (
                <ListPlus aria-hidden="true" />
              )}
              {open ? "Sign up" : "Join waitlist"}
            </Button>
            {formError && (
              <p role="alert" className="mt-3 text-sm text-miss">
                {formError}
              </p>
            )}
            <p className="mt-3 text-xs leading-relaxed text-fg-subtle">
              {open
                ? "We'll email you a link to finish creating your account."
                : "We'll ask you to confirm by email, then write once — the day sign-ups open. No picks, no spam, leave any time."}
            </p>
          </div>
        </>
      )}
    </form>
  );
}

/**
 * Replaces the form rather than stacking a message under it — a live field
 * below "done" invites a second submission. Focus moves here so a screen
 * reader isn't left on a button that no longer exists.
 */
function Done({ email, message }: { email: string; message?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    ref.current?.focus();
    ref.current?.scrollIntoView({ block: "center" });
  }, []);

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
          Check your inbox
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">
          {email && (
            <>
              Sent to <span className="break-words font-medium text-fg">{email.trim()}</span>.{" "}
            </>
          )}
          {message}
        </p>
      </div>
    </div>
  );
}
