"use server";

import { after } from "next/server";
import { headers } from "next/headers";
import { clientIp, rateLimit } from "@/lib/auth";
import { signupEnabled } from "@/lib/signup";
import { fieldErrorsFrom, type ActionState } from "@/lib/validation";
import { signupSurveySchema, surveyFromForm } from "@/lib/signup-survey";
import { confirmWaitlist, joinWaitlist, leaveWaitlist, saveSignupSurvey, startSignup } from "@/lib/waitlist";
import { BAD_DOMAIN, GUARD_MESSAGES, emailDomainAccepts, guardForm, takeSignupMailBudget } from "@/lib/spam-guard";

/**
 * The landing page's form and /signup's: the waitlist while sign-ups are
 * closed, a sign-up link once SIGNUP_ENABLED is on.
 *
 * The reply depends on the mode only, never on the address — and the lookup
 * and the email both happen after the response, so it takes the same time
 * too. Whether an address has an account is only ever told to its inbox.
 */
export async function getStartedAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signupSurveySchema.safeParse(surveyFromForm(formData));
  if (!parsed.success) {
    return { ok: false, error: "Some answers need another look.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }
  const email = parsed.data.email;
  const source = formData.get("source") === "signup" ? "signup" : "landing";
  const open = signupEnabled();
  const done: ActionState = {
    ok: true,
    message: open
      ? "We've sent a link to finish creating your account. It works for 48 hours."
      : "Check your inbox and press the button in our email to confirm your place — until you do, you're not on the list. Already confirmed? Then there's nothing more to do.",
  };

  // Bots (lib/spam-guard.ts): nobody fills the application in three seconds.
  // A decoy hit or a forged token gets the ordinary reply and nothing else.
  const guard = guardForm(formData, "signup application", 3000);
  if (guard === "bot") return done;
  if (guard !== "ok") return { ok: false, error: GUARD_MESSAGES[guard] };
  let mail = true;

  try {
    const ip = clientIp(await headers());
    // Per IP against walking a list, per address against filling one inbox.
    const ipOk = await rateLimit("get-started:ip", ip, 8, 15 * 60 * 1000);
    const emailOk = await rateLimit("get-started:email", email, 3, 60 * 60 * 1000);
    if (!ipOk || !emailOk) return { ok: false, error: "Too many tries. Give it a few minutes." };
    if (!(await emailDomainAccepts(email))) {
      return { ok: false, error: BAD_DOMAIN, fieldErrors: { email: [BAD_DOMAIN] } };
    }
    mail = await takeSignupMailBudget();
    // A sign-up link is the whole point of the form once sign-ups are open,
    // so without one to send, say so rather than pretend.
    if (open && !mail) return { ok: false, error: "We're getting a lot of sign-ups right now — try again in a few minutes." };
    // Saved before the reply: the answers are the point of the form. Never
    // over an existing account's own (see saveSignupSurvey).
    await saveSignupSurvey(parsed.data, source, { unlessAccount: true });
  } catch (err) {
    console.error("[get-started] rate limit or survey save failed:", err);
    return { ok: false, error: "Something went wrong. Try again in a moment." };
  }

  after(async () => {
    try {
      if (open) await startSignup(email);
      // Over the hour's mail budget they still join, without the confirmation.
      else await joinWaitlist(email, source, { mail });
    } catch (err) {
      console.error(`[get-started] ${open ? "sign-up" : "waitlist"} email failed:`, err);
    }
  });

  return done;
}

export type ConfirmState =
  | { ok: true; email: string; answered: boolean }
  | { ok: false; error: string }
  | null;

/**
 * The button on /waitlist/confirm. A POST, like leaving: opening the link
 * alone does nothing, so a mail scanner that follows every link can't put a
 * stranger on the list.
 */
export async function confirmWaitlistAction(_prev: ConfirmState, formData: FormData): Promise<ConfirmState> {
  const token = formData.get("token");
  if (typeof token !== "string" || token.length < 10 || token.length > 100) {
    return { ok: false, error: "That link is incomplete — open it from the email again." };
  }
  try {
    const ip = clientIp(await headers());
    if (!(await rateLimit("waitlist:confirm", ip, 20, 15 * 60 * 1000))) {
      return { ok: false, error: "Too many tries. Give it a few minutes." };
    }
    const done = await confirmWaitlist(token);
    if (!done) {
      return { ok: false, error: "That link has been used or has expired. Join again from the home page to get a new one." };
    }
    return { ok: true, email: done.email, answered: done.answered };
  } catch (err) {
    console.error("[waitlist] confirm failed:", err);
    return { ok: false, error: "Something went wrong. Try again in a moment." };
  }
}

/** The confirm button on /waitlist/leave — a POST, so a link prefetcher can't take anyone off. */
export async function leaveWaitlistAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const token = formData.get("token");
  if (typeof token !== "string" || token.length < 10 || token.length > 100) {
    return { ok: false, error: "That link is incomplete." };
  }
  try {
    const ip = clientIp(await headers());
    if (!(await rateLimit("waitlist:leave", ip, 10, 15 * 60 * 1000))) {
      return { ok: false, error: "Too many tries. Give it a few minutes." };
    }
    // Already gone (a second click, or the mailbox's own unsubscribe got
    // there first) is still the outcome they asked for.
    if (!(await leaveWaitlist(token))) return { ok: true, message: "You're not on the waitlist, so there's nothing to leave." };
  } catch (err) {
    console.error("[waitlist] leave failed:", err);
    return { ok: false, error: "Something went wrong. Try again in a moment." };
  }
  return { ok: true, message: "You're off the waitlist. We won't email you again." };
}
