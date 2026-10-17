import { z } from "zod";
import { emailSchema } from "./validation";

/**
 * The beta application: what /signup asks before it takes an address, and
 * what the invite wizard asks anyone who never went through /signup.
 * Answers live in signup_surveys, one row per email; asking again replaces
 * them.
 *
 * Shared by the server (the actions) and the browser (the forms check the
 * same rules before submitting), so nothing here may be server-only.
 */

export const NEVER = "Never";

export const BET_FREQUENCIES = [
  NEVER,
  "A few times per year",
  "A few times per month",
  "A few times per week",
  "Daily/Almost Daily",
  "Depends on the season",
] as const;

export const EXPERIENCE_LEVELS = ["Beginner", "Intermediate", "Experienced", "Expert"] as const;

export const SPORTS = ["NFL", "NBA", "MLB", "NHL", "College Sports", "UFC/MMA", "Soccer"] as const;

export const NO_SPORTSBOOK = "Don't use one";
export const SPORTSBOOKS = [
  "DraftKings",
  "FanDuel",
  "BetMGM",
  "Caesars",
  "Prediction markets (Kalshi or Polymarket)",
  NO_SPORTSBOOK,
] as const;

/** Ranges rather than free text, so answers can be compared and counted. */
export const BET_SIZES = ["Under $10", "$10–$25", "$25–$50", "$50–$100", "$100–$250", "$250+"] as const;

export const NO_TOOLS = "Nothing";
export const DECISION_TOOLS = [
  "Stats",
  "Social media",
  "Betting analyst",
  "Odds/analytics platforms",
  "Personal research",
  "Friends",
  NO_TOOLS,
] as const;

/** The "Other: ___" choice on the lists that have one. */
export const OTHER = "Other";

/** Pick-any lists where one answer rules out the rest ("Nothing" plus "Stats" says nothing). */
export const EXCLUSIVE_OPTION = {
  sportsbooks: NO_SPORTSBOOK,
  decisionTools: NO_TOOLS,
} as const;

/** Someone who never bets has no sportsbook, stake or method to tell us about. */
export function asksBettingHabits(betFrequency: string): boolean {
  return betFrequency !== NEVER;
}

const text = (max: number) => z.string().trim().max(max, `At most ${max} characters`);
const list = z
  .array(z.string().max(100))
  .max(20)
  .transform((xs) => [...new Set(xs)]);

export const signupSurveySchema = z
  .object({
    fullName: text(120),
    email: emailSchema,
    is21: z.string(),
    betFrequency: z.string(),
    experience: z.string(),
    sports: list,
    sportsOther: text(100),
    sportsbooks: list,
    sportsbooksOther: text(100),
    betSize: z.string(),
    decisionTools: list,
    decisionToolsOther: text(100),
    wants: text(1000),
    willGiveFeedback: z.string(),
    willDoSurvey: z.string(),
  })
  .superRefine((v, ctx) => {
    const fail = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
    const oneOf = (options: readonly string[], value: string) => options.includes(value);
    const pickAny = (key: "sports" | "sportsbooks" | "decisionTools", options: readonly string[], none: string) => {
      const picked = v[key];
      if (picked.length === 0) return fail(key, none);
      if (!picked.every((x) => options.includes(x) || x === OTHER)) return fail(key, "Pick from the list");
      const only = key === "sports" ? undefined : EXCLUSIVE_OPTION[key];
      if (only && picked.includes(only) && picked.length > 1) return fail(key, `"${only}" can't go with other answers`);
      if (picked.includes(OTHER) && !v[`${key}Other`]) fail(`${key}Other`, "Tell us what Other is");
    };

    if (!v.fullName) fail("fullName", "Enter your name");
    if (v.is21 === "no") fail("is21", "oobee bets is 21+ only.");
    else if (v.is21 !== "yes") fail("is21", "Tell us whether you're 21 or older");
    if (!oneOf(BET_FREQUENCIES, v.betFrequency)) fail("betFrequency", "Pick how often you bet");
    if (!oneOf(EXPERIENCE_LEVELS, v.experience)) fail("experience", "Pick the closest one");
    pickAny("sports", SPORTS, "Pick at least one sport");
    if (asksBettingHabits(v.betFrequency)) {
      pickAny("sportsbooks", SPORTSBOOKS, "Pick at least one");
      if (!oneOf(BET_SIZES, v.betSize)) fail("betSize", "Pick the closest range");
      pickAny("decisionTools", DECISION_TOOLS, "Pick at least one");
    }
    if (!v.wants) fail("wants", "A sentence is plenty");
    if (v.willGiveFeedback !== "yes" && v.willGiveFeedback !== "no") fail("willGiveFeedback", "Pick yes or no");
    if (v.willDoSurvey !== "yes") fail("willDoSurvey", "Tick this to join the beta");
  });

export type SignupSurvey = z.infer<typeof signupSurveySchema>;

export type SurveySource = "landing" | "signup" | "invite";

/** The form keys every answer is posted under, in the order /signup asks them. */
export const SURVEY_FIELDS = [
  "is21",
  "fullName",
  "email",
  "betFrequency",
  "experience",
  "sports",
  "sportsOther",
  "sportsbooks",
  "sportsbooksOther",
  "betSize",
  "decisionTools",
  "decisionToolsOther",
  "wants",
  "willGiveFeedback",
  "willDoSurvey",
] as const;

type ListField = "sports" | "sportsbooks" | "decisionTools";
export type SurveyField = (typeof SURVEY_FIELDS)[number];
/** What the schema takes: the pick-any answers as lists, everything else as text. */
export type SurveyInput = { [K in SurveyField]: K extends ListField ? string[] : string };

const LIST_FIELDS = new Set<string>(["sports", "sportsbooks", "decisionTools"] satisfies ListField[]);

/** FormData → the schema's input shape. */
export function surveyFromForm(f: FormData): SurveyInput {
  return Object.fromEntries(
    SURVEY_FIELDS.map((k) => {
      if (LIST_FIELDS.has(k)) return [k, f.getAll(k).filter((x): x is string => typeof x === "string")];
      const value = f.get(k);
      return [k, typeof value === "string" ? value : ""];
    }),
  ) as SurveyInput;
}

/** The reverse, for the forms: every answer under its form key. */
export function appendSurvey(f: FormData, v: SurveyInput): void {
  for (const k of SURVEY_FIELDS) {
    const value = v[k];
    if (Array.isArray(value)) for (const x of value) f.append(k, x);
    else f.set(k, value);
  }
}
