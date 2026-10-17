import "server-only";
import { randomBytes } from "node:crypto";
import { rateLimit } from "@/lib/auth";
import { HONEYPOT_FIELD, TOKEN_FIELD, checkFormToken, signFormToken } from "@/lib/form-token";

/**
 * Bot and abuse checks for the two forms anyone can post an email to: the
 * homepage's launch-list box and the /signup application.
 *
 * Why it matters more than spam in a list: both forms send an email to the
 * address typed. A bot that types other people's addresses turns our sending
 * domain into a mail bomb, and the bounces and spam reports that follow are
 * what get a domain throttled. (The launch list showed exactly that pattern in
 * September 2026: ~200 sign-ups in two days at a steady 10–15 an hour, with
 * corporate clusters and SMS gateways among them.)
 *
 * The layers, each cheap and invisible to a person:
 *   - a honeypot field only a bot fills — answered with a fake success;
 *   - a signed render time, so a post that arrives faster than anyone could
 *     type is refused;
 *   - the address's domain must be able to receive mail (MX, or an A/AAAA
 *     record), which catches typos and invented domains before we send;
 *   - per-address and per-IP limits (in the actions), plus a site-wide hourly
 *     ceiling on sign-up mail, so even a distributed bot can only cost us so
 *     many sends.
 */

/**
 * FORM_TOKEN_SECRET in production, so tokens survive a restart. Without it,
 * one per process: tokens still verify, but a page rendered before a deploy
 * asks for a refresh.
 */
const secret = process.env.FORM_TOKEN_SECRET || randomBytes(32).toString("base64url");
if (!process.env.FORM_TOKEN_SECRET && process.env.NODE_ENV === "production") {
  console.warn("[spam] FORM_TOKEN_SECRET is not set — form tokens won't survive a restart.");
}

/** For the page that renders a protected form. */
export function issueFormToken(): string {
  return signFormToken(secret, Date.now());
}

export type GuardVerdict = "ok" | "bot" | "too-fast" | "stale";

/**
 * Honeypot first, then the token. `bot` should be answered exactly like a
 * success, so a script learns nothing; `too-fast` and `stale` get a message a
 * person can act on.
 */
export function guardForm(form: FormData, label: string, minMs: number): GuardVerdict {
  const decoy = form.get(HONEYPOT_FIELD);
  if (typeof decoy === "string" && decoy.trim() !== "") {
    console.warn(`[spam] ${label}: honeypot filled — dropped`);
    return "bot";
  }
  const verdict = checkFormToken(secret, form.get(TOKEN_FIELD), Date.now(), {
    minMs,
    maxMs: 7 * 24 * 60 * 60 * 1000,
  });
  if (verdict === "invalid") {
    console.warn(`[spam] ${label}: missing or forged form token — dropped`);
    return "bot";
  }
  if (verdict === "too-fast") console.warn(`[spam] ${label}: posted within ${minMs}ms of the page — refused`);
  return verdict;
}

export const GUARD_MESSAGES = {
  "too-fast": "That was quick — give it a second and press it again.",
  stale: "This page has been open a while — refresh it and try again.",
} as const;

/* ------------------------------------------------------------ the address */

export { emailDomainAccepts } from "@/lib/email-domain";

export const BAD_DOMAIN = "That email's domain can't receive mail — check it for a typo.";

/**
 * One send from the site-wide hourly budget for sign-up mail (launch-list
 * welcome, waitlist confirmation, "you already have an account", self-serve
 * sign-up links). Far above real traffic; what it stops is a distributed bot
 * mailing strangers through us.
 */
export async function takeSignupMailBudget(): Promise<boolean> {
  const ok = await rateLimit("mail:signup", "all", 200, 60 * 60 * 1000);
  if (!ok) console.warn("[spam] sign-up mail budget spent for this hour — not sending");
  return ok;
}
