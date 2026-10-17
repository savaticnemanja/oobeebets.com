import { z } from "zod";
import { parsePhoneNumberFromString } from "libphonenumber-js";

/** Rejects the handful of passwords that make up most credential-stuffing hits. */
const COMMON_PASSWORDS = new Set([
  "password", "password1", "password123", "12345678", "123456789", "qwerty123",
  "letmein1", "welcome1", "admin123", "iloveyou", "football", "baseball",
  "sunshine", "princess", "1qaz2wsx", "qwertyuiop", "changeme",
]);

export const emailSchema = z
  .string()
  .trim()
  .min(3, "Enter your email")
  .max(254)
  .email("That doesn't look like an email")
  .transform((s) => s.toLowerCase());

export const passwordSchema = z
  .string()
  .min(8, "At least 8 characters")
  .max(200, "That's too long")
  .refine((p) => !COMMON_PASSWORDS.has(p.toLowerCase()), "That password is too common");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password"),
});

export const nameSchema = z.string().trim().min(1, "Enter your name").max(120);

/**
 * The onboarding form posts E.164 (`+381641234567`), but this parses anything
 * that carries its own country code, and normalises to E.164 so every stored
 * number has one shape. Validation is the same libphonenumber pass the client
 * runs, so the two can't disagree about what's acceptable.
 */
export const phoneSchema = z
  .string()
  .trim()
  .min(1, "Enter a phone number")
  .max(30, "That's too long")
  .refine(
    (v) => parsePhoneNumberFromString(v)?.isValid() ?? false,
    "That doesn't look like a valid phone number",
  )
  .transform((v) => parsePhoneNumberFromString(v)!.number as string);

export const spendBandValues = [
  "under_50", "50_200", "200_500", "500_1000", "over_1000",
] as const;

export const SPEND_BAND_LABELS: Record<(typeof spendBandValues)[number], string> = {
  under_50: "Under $50",
  "50_200": "$50 – $200",
  "200_500": "$200 – $500",
  "500_1000": "$500 – $1,000",
  over_1000: "Over $1,000",
};

/**
 * A stake in units: 0.1 up to `max`, to the cent — 1.01 is fine, 1.015 is
 * refused rather than quietly rounded by the numeric(5,2) column.
 */
export function unitsSchema(max: number) {
  return z.coerce
    .number()
    .min(0.1, "At least 0.1 units")
    .max(max, `At most ${max} units`)
    .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, "Two decimal places at most");
}

/**
 * Posted once, at the end of the invite-accept wizard. `token` and `email`
 * come back as hidden fields mirroring what the server already resolved from
 * the invite link — the action re-derives the real values from the token
 * itself rather than trusting either.
 */
export const onboardingSchema = z
  .object({
    email: emailSchema,
    token: z.string().min(1, "Missing invite token"),
    password: passwordSchema,
    confirm: z.string(),
    name: nameSchema,
    // Optional (empty → null) since 13 Oct 2026: nothing in the product uses
    // it yet. The monthly-spend question that sat beside it went on 17 Oct:
    // the beta application (lib/signup-survey.ts) asks bet size and how often.
    phone: z.union([z.literal("").transform(() => null), phoneSchema]),
    // The 21+ / Terms checkbox. Required: sports betting is 21+ in nearly every
    // US state, and this is where they say so (users.terms_accepted_at
    // records when).
    agree: z.literal("yes", { error: "Confirm you're 21 or older and accept the Terms to finish" }),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Passwords don't match",
    path: ["confirm"],
  });

// The hand-typed pick form and its schema are gone: since migration 0010 a
// pick can only be made from an odds-feed line (createPickAction in
// app/actions/admin.ts, which validates what is left to type).

/* --------------------------------------------------------- announcements */

export const audienceValues = ["all", "testers", "custom"] as const;

export type Audience = (typeof audienceValues)[number];

export const AUDIENCE_LABELS: Record<Audience, string> = {
  all: "Every account",
  testers: "Testers only",
  custom: "Custom list",
};

/**
 * A hard ceiling on one send. Not a Resend limit — a blast radius. The beta is
 * a room deliberately kept small, so a send addressing more than this many
 * people means something has gone wrong with the audience, and stopping is a
 * better answer than delivering it.
 */
export const MAX_ANNOUNCEMENT_RECIPIENTS = 500;

/**
 * Addresses typed into the custom list, one per line or comma-separated.
 * Parsed leniently (people paste from spreadsheets) and validated strictly.
 */
export function parseAddressList(raw: string): string[] {
  const seen = new Set<string>();
  for (const part of raw.split(/[\s,;]+/)) {
    const trimmed = part.trim().toLowerCase();
    if (trimmed) seen.add(trimmed);
  }
  return [...seen];
}

export const announcementSchema = z.object({
  heading: z.string().trim().min(1, "The email needs a heading").max(120, "That's too long"),
  body: z.string().trim().min(1, "The email needs some content").max(5000, "That's too long"),
  audience: z.enum(audienceValues),
  /** Only read when audience is "custom". */
  recipients: z.string().optional().default(""),
});

export const settleSchema = z.object({
  pickId: z.string().uuid(),
  status: z.enum(["won", "lost", "push", "void"]),
  finalScore: z.string().trim().max(60).optional().or(z.literal("")),
  voidReason: z.string().trim().max(300).optional().or(z.literal("")),
});

export const feedbackKindValues = ["bug", "idea", "other"] as const;
export type FeedbackKindValue = (typeof feedbackKindValues)[number];

export const FEEDBACK_KIND_LABELS: Record<FeedbackKindValue, string> = {
  bug: "Something's broken",
  idea: "Idea",
  other: "Other",
};

export const FEEDBACK_MAX_LENGTH = 2000;

export const feedbackSchema = z.object({
  kind: z.enum(feedbackKindValues, { message: "Pick what this is about" }),
  body: z
    .string()
    .trim()
    .min(1, "Tell us what's on your mind")
    .max(FEEDBACK_MAX_LENGTH, "That's too long"),
  /** Where the dialog was opened. Ours to record, never shown back as a link. */
  pagePath: z.string().trim().max(300).optional().or(z.literal("")),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type OnboardingInput = z.infer<typeof onboardingSchema>;

/** Shape every server action returns, so forms can render errors uniformly. */
/**
 * An optional number from a form field. z.coerce turns a blank input into 0,
 * which would print "Confidence 0%" for a field nobody filled in; blank here
 * means not given.
 */
export function optionalNumber<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((v) => (v === "" || v === null ? undefined : v), schema.optional());
}

export type ActionState =
  | { ok: true; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> }
  | null;

export function fieldErrorsFrom(err: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}
