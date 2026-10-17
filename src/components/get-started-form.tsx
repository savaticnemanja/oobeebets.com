"use client";

import * as React from "react";
import { useActionState } from "react";
import { ArrowRight, Check, ListPlus, Loader2 } from "lucide-react";
import { getStartedAction } from "@/app/actions/waitlist";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/lib/validation";
import {
  BET_FREQUENCIES,
  DECISION_TOOLS,
  EXPERIENCE_LEVELS,
  OTHER,
  SPORTS,
  SPORTSBOOKS,
} from "@/lib/signup-survey";

/**
 * The beta application: every question /signup asks, then "Join waitlist"
 * while sign-ups are closed or "Sign up" once SIGNUP_ENABLED is on. Answers
 * are kept in signup_surveys. Submitted by hand rather than through the
 * form's action so a rejected submission doesn't reset what was typed.
 */
export function GetStartedForm({ open, source }: { open: boolean; source: "landing" | "signup" }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(getStartedAction, null);
  const [email, setEmail] = React.useState("");
  const [otherOn, setOtherOn] = React.useState({ sports: false, sportsbook: false, decisionTools: false });

  if (state?.ok) return <Done email={email} open={open} message={state.message} />;

  const errs = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const err = (k: string) => errs[k]?.[0];

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    React.startTransition(() => action(data));
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-7">
      <input type="hidden" name="source" value={source} />

      <Field label="First and last name" name="fullName" error={err("fullName")} autoComplete="name" />
      <Field
        label="Email address"
        name="email"
        type="email"
        autoComplete="email"
        error={err("email")}
        value={email}
        onChange={setEmail}
      />

      <Choice legend="Are you 21+?" name="is21" options={["yes", "no"]} labels={YES_NO} error={err("is21")} />
      <Choice legend="How often do you currently sports bet?" name="betFrequency" options={BET_FREQUENCIES} error={err("betFrequency")} />
      <Choice
        legend="How would you describe your sports betting experience?"
        name="experience"
        options={EXPERIENCE_LEVELS}
        error={err("experience")}
      />
      <Choice
        legend="Which sports do you typically bet on?"
        name="sports"
        multiple
        options={[...SPORTS, OTHER]}
        error={err("sports")}
        onOther={(on) => setOtherOn((o) => ({ ...o, sports: on }))}
        other={otherOn.sports && <OtherInput name="sportsOther" error={err("sportsOther")} />}
      />
      <Choice
        legend="What sportsbook do you typically use?"
        name="sportsbook"
        options={[...SPORTSBOOKS, OTHER]}
        error={err("sportsbook")}
        onOther={(on) => setOtherOn((o) => ({ ...o, sportsbook: on }))}
        other={otherOn.sportsbook && <OtherInput name="sportsbookOther" error={err("sportsbookOther")} />}
      />
      <Field label="Typical bet size" name="betSize" error={err("betSize")} placeholder="e.g. $20" />
      <Choice
        legend="What do you currently use to make betting decisions?"
        name="decisionTools"
        multiple
        options={[...DECISION_TOOLS, OTHER]}
        error={err("decisionTools")}
        onOther={(on) => setOtherOn((o) => ({ ...o, decisionTools: on }))}
        other={otherOn.decisionTools && <OtherInput name="decisionToolsOther" error={err("decisionToolsOther")} />}
      />
      <Field
        label="What would you most want from a sports betting analytics platform?"
        name="wants"
        multiline
        error={err("wants")}
      />
      <Choice
        legend="Would you be willing to use Oobee and give feedback throughout the trial?"
        name="willGiveFeedback"
        options={["yes", "no"]}
        labels={YES_NO}
        error={err("willGiveFeedback")}
      />
      <Choice
        legend="Would you be willing to complete a short survey after the beta trial?"
        name="willDoSurvey"
        options={["yes"]}
        labels={YES_NO}
        error={err("willDoSurvey")}
      />

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
        {state && !state.ok && (
          <p role="alert" className="mt-3 text-sm text-miss">
            {state.error}
          </p>
        )}
        <p className="mt-3 text-xs leading-relaxed text-fg-subtle">
          {open
            ? "We'll email you a link to finish creating your account. 21+ only."
            : "One email the day sign-ups open, and nothing before it. No picks, no spam, leave any time."}
        </p>
      </div>
    </form>
  );
}

const YES_NO: Record<string, string> = { yes: "Yes", no: "No" };

function Req() {
  return (
    <span className="text-miss" aria-hidden="true">
      {" "}*
    </span>
  );
}

function ErrorText({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 text-xs text-miss">
      {message}
    </p>
  );
}

function Field({
  label,
  name,
  error,
  type = "text",
  multiline,
  value,
  onChange,
  ...rest
}: {
  label: string;
  name: string;
  error?: string;
  type?: string;
  multiline?: boolean;
  value?: string;
  onChange?: (v: string) => void;
  autoComplete?: string;
  placeholder?: string;
}) {
  const id = `signup-${name}`;
  const common = {
    id,
    name,
    required: true,
    "aria-invalid": Boolean(error),
    "aria-describedby": error ? `${id}-error` : undefined,
    ...(onChange ? { value, onChange: (e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => onChange(e.target.value) } : {}),
    ...rest,
  };
  return (
    <div>
      <Label htmlFor={id} className="text-sm text-fg">
        {label}
        <Req />
      </Label>
      <div className="mt-2">
        {multiline ? (
          <textarea
            {...common}
            rows={3}
            maxLength={1000}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:border-brand/60 focus:outline-none"
          />
        ) : (
          <Input {...common} type={type} />
        )}
      </div>
      <ErrorText id={`${id}-error`} message={error} />
    </div>
  );
}

function OtherInput({ name, error }: { name: string; error?: string }) {
  const id = `signup-${name}`;
  return (
    <div className="mt-2">
      <Input id={id} name={name} maxLength={100} placeholder="Other…" aria-label="Other" aria-invalid={Boolean(error)} autoFocus />
      <ErrorText id={`${id}-error`} message={error} />
    </div>
  );
}

function Choice({
  legend,
  name,
  options,
  labels,
  multiple,
  error,
  other,
  onOther,
}: {
  legend: string;
  name: string;
  options: readonly string[];
  labels?: Record<string, string>;
  multiple?: boolean;
  error?: string;
  other?: React.ReactNode;
  onOther?: (on: boolean) => void;
}) {
  const errorId = `signup-${name}-error`;
  return (
    <fieldset aria-describedby={error ? errorId : undefined}>
      <legend className="text-sm text-fg">
        {legend}
        <Req />
        {multiple && <span className="ml-1 text-xs text-fg-subtle">(pick any)</span>}
      </legend>
      <div className="mt-3 grid gap-2">
        {options.map((value) => (
          <label
            key={value}
            className="flex cursor-pointer items-center rounded-lg border border-border bg-surface px-4 py-3 text-sm text-fg transition-colors has-[:checked]:border-brand/60 has-[:checked]:bg-brand/5 hover:border-border-strong"
          >
            <input
              type={multiple ? "checkbox" : "radio"}
              name={name}
              value={value}
              className="peer sr-only"
              onChange={(e) => {
                if (!onOther) return;
                if (multiple) {
                  if (value === OTHER) onOther(e.target.checked);
                } else onOther(value === OTHER);
              }}
            />
            <span>{labels?.[value] ?? (value === OTHER ? "Other" : value)}</span>
            <span
              className={`ml-auto size-4 shrink-0 border border-border-strong peer-checked:border-brand peer-checked:bg-brand ${multiple ? "rounded" : "rounded-full"}`}
              aria-hidden="true"
            />
          </label>
        ))}
      </div>
      {other}
      <ErrorText id={errorId} message={error} />
    </fieldset>
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
