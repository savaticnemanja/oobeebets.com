import { z } from "zod";
import { emailSchema } from "@/lib/validation";

/**
 * The questions /signup asks before it takes an address — the beta
 * application. Answers live in signup_surveys, one row per email; asking
 * again replaces them.
 */

export const BET_FREQUENCIES = [
  "Never",
  "A few times per year",
  "A few times per month",
  "A few times per week",
  "Daily/Almost Daily",
  "Depends on the season",
] as const;

export const EXPERIENCE_LEVELS = ["Beginner", "Intermediate", "Experienced", "Expert"] as const;

export const SPORTS = ["NFL", "NBA", "MLB", "NHL", "College Sports", "UFC/MMA", "Soccer"] as const;

export const SPORTSBOOKS = [
  "DraftKings",
  "FanDuel",
  "BetMGM",
  "Caesars",
  "Prediction markets (Kalshi or Polymarket)",
  "Don't use one",
] as const;

export const DECISION_TOOLS = [
  "Stats",
  "Social media",
  "Betting analyst",
  "Odds/analytics platforms",
  "Personal research",
  "Friends",
  "Nothing",
] as const;

/** The "Other: ___" choice on the lists that have one. */
export const OTHER = "Other";

const short = (label: string, max = 200) =>
  z.string().trim().min(1, `${label} is required`).max(max, `At most ${max} characters`);
const yesNo = (msg: string) => z.enum(["yes", "no"], { message: msg });
const otherText = z.string().trim().max(100, "At most 100 characters");

/** Picks from a fixed list plus an optional "Other" — Other needs its text. */
function multi(options: readonly string[], label: string) {
  return z
    .array(z.string())
    .transform((xs) => [...new Set(xs)])
    .refine((xs) => xs.every((x) => options.includes(x) || x === OTHER), "Pick from the list")
    .refine((xs) => xs.length > 0, `Pick at least one ${label}`);
}

export const signupSurveySchema = z
  .object({
    fullName: short("Your name", 120),
    email: emailSchema,
    is21: yesNo("Tell us whether you're 21+"),
    betFrequency: z.enum(BET_FREQUENCIES, { message: "Pick how often you bet" }),
    experience: z.enum(EXPERIENCE_LEVELS, { message: "Pick your experience" }),
    sports: multi(SPORTS, "sport"),
    sportsOther: otherText,
    sportsbook: z.enum([...SPORTSBOOKS, OTHER], { message: "Pick a sportsbook" }),
    sportsbookOther: otherText,
    betSize: short("Typical bet size", 100),
    decisionTools: multi(DECISION_TOOLS, "option"),
    decisionToolsOther: otherText,
    wants: short("This answer", 1000),
    willGiveFeedback: yesNo("Tell us whether you'd give feedback"),
    willDoSurvey: z.literal("yes", { message: "Tick yes to continue" }),
  })
  .superRefine((v, ctx) => {
    if (v.is21 === "no") ctx.addIssue({ code: "custom", path: ["is21"], message: "oobee bets is 21+ only." });
    const needs = [
      ["sports", v.sports.includes(OTHER), v.sportsOther],
      ["sportsbook", v.sportsbook === OTHER, v.sportsbookOther],
      ["decisionTools", v.decisionTools.includes(OTHER), v.decisionToolsOther],
    ] as const;
    for (const [key, picked, text] of needs) {
      if (picked && !text) ctx.addIssue({ code: "custom", path: [`${key}Other`], message: "Fill in Other" });
    }
  });

export type SignupSurvey = z.infer<typeof signupSurveySchema>;

/** FormData → the schema's input shape. */
export function surveyFromForm(f: FormData) {
  const s = (k: string) => (typeof f.get(k) === "string" ? (f.get(k) as string) : "");
  const all = (k: string) => f.getAll(k).filter((x): x is string => typeof x === "string");
  return {
    fullName: s("fullName"),
    email: s("email"),
    is21: s("is21"),
    betFrequency: s("betFrequency"),
    experience: s("experience"),
    sports: all("sports"),
    sportsOther: s("sportsOther"),
    sportsbook: s("sportsbook"),
    sportsbookOther: s("sportsbookOther"),
    betSize: s("betSize"),
    decisionTools: all("decisionTools"),
    decisionToolsOther: s("decisionToolsOther"),
    wants: s("wants"),
    willGiveFeedback: s("willGiveFeedback"),
    willDoSurvey: s("willDoSurvey"),
  };
}
