import { z } from "zod";
import type { Sport } from "@/db/schema";

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

export const signupSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Passwords don't match",
    path: ["confirm"],
  });

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password"),
});

export const sportValues = [
  "soccer", "basketball", "baseball", "tennis", "hockey", "football",
] as const;

export const marketValues = ["moneyline", "spread", "total", "prop"] as const;

/** The only leagues the composer publishes to right now. */
export const leagueValues = ["MLB", "NFL"] as const;

/** Sport is derived from league, never submitted independently — one less
 * thing a form (or a forged request) can get out of sync. */
export const LEAGUE_SPORT: Record<(typeof leagueValues)[number], Sport> = {
  MLB: "baseball",
  NFL: "football",
};

export const pickSchema = z.object({
  slateDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  league: z.enum(leagueValues),
  awayTeam: z.string().trim().min(1, "Away team is required").max(90),
  homeTeam: z.string().trim().min(1, "Home team is required").max(90),
  startsAt: z.string().min(1, "Kick-off time is required"),
  market: z.enum(marketValues),
  selection: z.string().trim().min(1, "Selection is required").max(120),
  price: z.coerce
    .number()
    .int()
    .refine((n) => n >= 100 || n <= -100, "American odds: >= +100 or <= -100"),
  units: z.coerce.number().min(0.1).max(10).default(1),
  confidence: z.coerce.number().int().min(0).max(100).optional(),
  evPct: z.coerce.number().min(-100).max(100).optional(),
  reasoning: z.string().trim().max(1000).optional().or(z.literal("")),
});

export const settleSchema = z.object({
  pickId: z.string().uuid(),
  status: z.enum(["won", "lost", "push", "void"]),
  finalScore: z.string().trim().max(60).optional().or(z.literal("")),
  voidReason: z.string().trim().max(300).optional().or(z.literal("")),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type PickInput = z.infer<typeof pickSchema>;

/** Shape every server action returns, so forms can render errors uniformly. */
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
