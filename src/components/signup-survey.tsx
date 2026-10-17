"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { HelpLine } from "@/components/help-line";
import { cn } from "@/lib/utils";
import {
  BET_FREQUENCIES,
  BET_SIZES,
  DECISION_TOOLS,
  EXCLUSIVE_OPTION,
  EXPERIENCE_LEVELS,
  OTHER,
  SPORTS,
  SPORTSBOOKS,
  SURVEY_FIELDS,
  asksBettingHabits,
  signupSurveySchema,
  type SurveyField,
  type SurveyInput,
} from "@/lib/signup-survey";

/**
 * The beta application's questions, for /signup (get-started-form.tsx) and
 * the invite wizard (onboarding-form.tsx). Every answer is controlled state,
 * checked in the browser by the same schema the server uses, and posted by
 * the form through appendSurvey — the inputs carry `q-` names so they never
 * collide with the keys the server reads.
 */

export const EMPTY_SURVEY: SurveyInput = {
  fullName: "",
  email: "",
  is21: "",
  betFrequency: "",
  experience: "",
  sports: [],
  sportsOther: "",
  sportsbooks: [],
  sportsbooksOther: "",
  betSize: "",
  decisionTools: [],
  decisionToolsOther: "",
  wants: "",
  willGiveFeedback: "",
  willDoSurvey: "",
};

/** The questions on the invite wizard's "How you bet" step, in order. */
export const BETTING_FIELDS = [
  "betFrequency",
  "experience",
  "sports",
  "sportsOther",
  "sportsbooks",
  "sportsbooksOther",
  "betSize",
  "decisionTools",
  "decisionToolsOther",
] as const satisfies readonly SurveyField[];

/** …and on its last step. */
export const BETA_FIELDS = ["wants", "willGiveFeedback", "willDoSurvey"] as const satisfies readonly SurveyField[];

type ListField = "sports" | "sportsbooks" | "decisionTools";
export type SurveyErrors = Partial<Record<SurveyField, string>>;

/** The answers, and the errors from the last check — an error clears as soon as its answer changes. */
export function useSurvey(initial?: Partial<SurveyInput>) {
  const [values, setValues] = React.useState<SurveyInput>(() => ({ ...EMPTY_SURVEY, ...initial }));
  const [errors, setErrors] = React.useState<SurveyErrors>({});

  function clear(...keys: SurveyField[]) {
    setErrors((e) => (keys.some((k) => e[k]) ? { ...e, ...Object.fromEntries(keys.map((k) => [k, undefined])) } : e));
  }

  function set<K extends Exclude<SurveyField, ListField>>(key: K, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
    clear(key);
  }

  /** Ticks or unticks one answer; "Nothing" and "Don't use one" untick the rest, and the rest untick them. */
  function toggle(key: ListField, option: string) {
    const only: string | undefined = key === "sports" ? undefined : EXCLUSIVE_OPTION[key];
    setValues((v) => {
      const current = v[key];
      const next = current.includes(option)
        ? current.filter((x) => x !== option)
        : option === only
          ? [option]
          : [...current.filter((x) => x !== only), option];
      return { ...v, [key]: next };
    });
    clear(key, `${key}Other`);
  }

  return { values, errors, setErrors, set, toggle };
}

export type Survey = ReturnType<typeof useSurvey>;

/** The server's rules, run here; only `fields` are reported when given. */
export function checkSurvey(values: SurveyInput, fields?: readonly SurveyField[]): SurveyErrors {
  const parsed = signupSurveySchema.safeParse(values);
  if (parsed.success) return {};
  const out: SurveyErrors = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path[0] as SurveyField;
    if (fields && !fields.includes(key)) continue;
    out[key] ??= issue.message;
  }
  return out;
}

/** An action's fieldErrors, cut down to the survey's own. */
export function surveyErrorsFrom(fieldErrors: Record<string, string[]> | undefined): SurveyErrors {
  const out: SurveyErrors = {};
  for (const k of SURVEY_FIELDS) if (fieldErrors?.[k]?.[0]) out[k] = fieldErrors[k][0];
  return out;
}

const fieldId = (key: string) => `survey-${key}`;

/** Brings the first question with an error into view and puts focus on it. */
export function focusFirstError(errors: SurveyErrors) {
  const key = SURVEY_FIELDS.find((k) => errors[k]);
  const el = key ? document.getElementById(fieldId(key)) : null;
  if (!el) return;
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  const target = el instanceof HTMLFieldSetElement ? el.querySelector("input") : el;
  target?.focus({ preventScroll: true });
}

/* ------------------------------------------------------------ building blocks */

export function SurveySection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-6">
      <div className="border-b border-border pb-2">
        <h2 className="text-base font-semibold tracking-tight text-fg">{title}</h2>
        {description && <p className="mt-1 text-sm text-fg-muted">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function ErrorText({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-2 text-xs text-miss">
      {message}
    </p>
  );
}

const QUESTION = "text-sm font-medium text-fg";
const HINT = "mt-1 text-xs text-fg-subtle";

export function TextQuestion({
  survey,
  field,
  label,
  hint,
  multiline,
  type = "text",
  autoComplete,
  placeholder,
  maxLength,
}: {
  survey: Survey;
  field: "fullName" | "email" | "wants";
  label: string;
  hint?: string;
  multiline?: boolean;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
  maxLength?: number;
}) {
  const id = fieldId(field);
  const error = survey.errors[field];
  const common = {
    id,
    name: `q-${field}`,
    value: survey.values[field],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => survey.set(field, e.target.value),
    autoComplete,
    placeholder,
    maxLength,
    "aria-invalid": Boolean(error) || undefined,
    "aria-describedby": error ? `${id}-error` : hint ? `${id}-hint` : undefined,
  };
  return (
    <div>
      <label htmlFor={id} className={QUESTION}>
        {label}
      </label>
      {hint && (
        <p id={`${id}-hint`} className={HINT}>
          {hint}
        </p>
      )}
      <div className="mt-2">
        {multiline ? (
          <textarea
            {...common}
            rows={3}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:border-brand/60 focus:outline-none aria-[invalid=true]:border-miss/60"
          />
        ) : (
          <Input {...common} type={type} />
        )}
      </div>
      <ErrorText id={`${id}-error`} message={error} />
    </div>
  );
}

function OptionCard({
  type,
  name,
  value,
  label,
  checked,
  onChange,
}: {
  type: "radio" | "checkbox";
  name: string;
  value: string;
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label
      className={cn(
        // `relative` keeps the visually hidden input inside its own card, so
        // focusing it (keyboard, or an error jump) scrolls to the right place.
        "relative flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-fg transition-colors",
        "hover:border-border-strong has-[:checked]:border-brand/60 has-[:checked]:bg-brand/5",
        "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/50",
      )}
    >
      <input type={type} name={name} value={value} checked={checked} onChange={onChange} className="peer sr-only" />
      <span
        className={cn(
          "grid size-4 shrink-0 place-items-center border border-border-strong text-black peer-checked:border-brand peer-checked:bg-brand",
          type === "radio" ? "rounded-full" : "rounded",
        )}
        aria-hidden="true"
      >
        {type === "checkbox" && checked && <Check className="size-3" strokeWidth={3} />}
      </span>
      <span className="min-w-0">{label}</span>
    </label>
  );
}

function Options({ columns, children }: { columns?: 1 | 2; children: React.ReactNode }) {
  return <div className={cn("mt-3 grid gap-2", columns === 2 && "grid-cols-2")}>{children}</div>;
}

export function ChoiceQuestion({
  survey,
  field,
  legend,
  hint,
  options,
  labels,
  columns,
}: {
  survey: Survey;
  field: "is21" | "betFrequency" | "experience" | "betSize" | "willGiveFeedback";
  legend: string;
  hint?: string;
  options: readonly string[];
  labels?: Record<string, string>;
  columns?: 1 | 2;
}) {
  const id = fieldId(field);
  const error = survey.errors[field];
  return (
    <fieldset id={id} aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined} aria-invalid={Boolean(error) || undefined}>
      <legend className={QUESTION}>{legend}</legend>
      {hint && (
        <p id={`${id}-hint`} className={HINT}>
          {hint}
        </p>
      )}
      <Options columns={columns}>
        {options.map((value) => (
          <OptionCard
            key={value}
            type="radio"
            name={`q-${field}`}
            value={value}
            label={labels?.[value] ?? value}
            checked={survey.values[field] === value}
            onChange={() => survey.set(field, value)}
          />
        ))}
      </Options>
      <ErrorText id={`${id}-error`} message={error} />
    </fieldset>
  );
}

export function PickAnyQuestion({
  survey,
  field,
  legend,
  options,
  columns,
}: {
  survey: Survey;
  field: ListField;
  legend: string;
  options: readonly string[];
  columns?: 1 | 2;
}) {
  const id = fieldId(field);
  const otherKey = `${field}Other` as const;
  const otherId = fieldId(otherKey);
  const error = survey.errors[field];
  const picked = survey.values[field];
  return (
    <fieldset id={id} aria-describedby={error ? `${id}-error` : undefined} aria-invalid={Boolean(error) || undefined}>
      <legend className={QUESTION}>{legend}</legend>
      <p className={HINT}>Pick all that apply.</p>
      <Options columns={columns}>
        {[...options, OTHER].map((value) => (
          <OptionCard
            key={value}
            type="checkbox"
            name={`q-${field}`}
            value={value}
            label={value}
            checked={picked.includes(value)}
            onChange={() => survey.toggle(field, value)}
          />
        ))}
      </Options>
      {picked.includes(OTHER) && (
        <div className="mt-2">
          <Input
            id={otherId}
            name={`q-${otherKey}`}
            value={survey.values[otherKey]}
            onChange={(e) => survey.set(otherKey, e.target.value)}
            maxLength={100}
            placeholder="Other — tell us which"
            aria-label={`${legend} Other`}
            aria-invalid={Boolean(survey.errors[otherKey]) || undefined}
            aria-describedby={survey.errors[otherKey] ? `${otherId}-error` : undefined}
          />
          <ErrorText id={`${otherId}-error`} message={survey.errors[otherKey]} />
        </div>
      )}
      <ErrorText id={`${id}-error`} message={error} />
    </fieldset>
  );
}

const YES_NO = ["yes", "no"] as const;
const YES_NO_LABELS: Record<string, string> = { yes: "Yes", no: "No" };

/* ------------------------------------------------------------- the questions */

/** /signup only: the invite wizard's Terms box already confirms age. */
export function AgeQuestion({ survey }: { survey: Survey }) {
  return (
    <ChoiceQuestion survey={survey} field="is21" legend="Are you 21 or older?" options={YES_NO} labels={YES_NO_LABELS} columns={2} />
  );
}

export function FullNameQuestion({ survey, hint }: { survey: Survey; hint: string }) {
  return <TextQuestion survey={survey} field="fullName" label="First and last name" hint={hint} autoComplete="name" maxLength={120} />;
}

/**
 * How someone bets. Someone who never does isn't asked for a sportsbook, a
 * stake or a method — there'd be nothing true to answer.
 */
export function BettingQuestions({ survey }: { survey: Survey }) {
  const habits = asksBettingHabits(survey.values.betFrequency);
  return (
    <>
      <ChoiceQuestion survey={survey} field="betFrequency" legend="How often do you currently bet on sports?" options={BET_FREQUENCIES} />
      <ChoiceQuestion
        survey={survey}
        field="experience"
        legend="How would you describe your sports betting experience?"
        options={EXPERIENCE_LEVELS}
        columns={2}
      />
      <PickAnyQuestion
        survey={survey}
        field="sports"
        legend={habits ? "Which sports do you typically bet on?" : "Which sports would you want to bet on?"}
        options={SPORTS}
        columns={2}
      />
      {habits && (
        <>
          <PickAnyQuestion survey={survey} field="sportsbooks" legend="Which sportsbooks do you typically use?" options={SPORTSBOOKS} />
          <ChoiceQuestion
            survey={survey}
            field="betSize"
            legend="What's your typical bet size?"
            hint="Roughly, on a single bet."
            options={BET_SIZES}
            columns={2}
          />
          <PickAnyQuestion
            survey={survey}
            field="decisionTools"
            legend="What do you currently use to make betting decisions?"
            options={DECISION_TOOLS}
            columns={2}
          />
          <p className="text-xs text-fg-subtle">
            <HelpLine />
          </p>
        </>
      )}
    </>
  );
}

/** What they want from us, and what they'll give the beta. */
export function BetaQuestions({ survey }: { survey: Survey }) {
  const error = survey.errors.willDoSurvey;
  const id = fieldId("willDoSurvey");
  return (
    <>
      <TextQuestion
        survey={survey}
        field="wants"
        label="What would you most want from a sports betting analytics platform?"
        placeholder="e.g. better prop research, a record I can trust, alerts when lines move"
        multiline
        maxLength={1000}
      />
      <ChoiceQuestion
        survey={survey}
        field="willGiveFeedback"
        legend="Would you be willing to use oobee bets and give feedback throughout the beta?"
        options={YES_NO}
        labels={YES_NO_LABELS}
        columns={2}
      />
      <div>
        <label className="flex cursor-pointer items-start gap-3 text-sm text-fg">
          <input
            id={id}
            type="checkbox"
            name="q-willDoSurvey"
            checked={survey.values.willDoSurvey === "yes"}
            onChange={(e) => survey.set("willDoSurvey", e.target.checked ? "yes" : "")}
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            className="mt-0.5 size-4 shrink-0 accent-[var(--color-brand)]"
          />
          <span>I&apos;ll complete a short survey when the beta ends.</span>
        </label>
        <ErrorText id={`${id}-error`} message={error} />
      </div>
    </>
  );
}
