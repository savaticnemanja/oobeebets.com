"use server";

import { after } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { clientIp, rateLimit } from "@/lib/auth";
import { signupEnabled } from "@/lib/signup";
import { emailSchema, fieldErrorsFrom, type ActionState } from "@/lib/validation";
import { signupSurveySchema, surveyFromForm } from "@/lib/signup-survey";
import { InvalidUnsubscribeLink } from "@/lib/newsletter";
import {
  confirmWaitlist,
  joinWaitlist,
  requestUnsubscribeLink,
  saveSignupSurvey,
  startSignup,
  unsubscribeByToken,
} from "@/lib/waitlist";
import { BAD_DOMAIN, GUARD_MESSAGES, emailDomainAccepts, guardForm, takeSignupMailBudget } from "@/lib/spam-guard";

/**
 * Every public way on and off the waitlist (lib/waitlist.ts):
 *
 *   joinWaitlistAction    — the homepage box: an email.
 *   getStartedAction      — /signup: the application, then the waitlist (or a
 *                           sign-up link once SIGNUP_ENABLED is on).
 *   confirmWaitlistAction — the button on /waitlist/confirm.
 *   unsubscribeAction     — /unsubscribe: by a link's token, or by typing an
 *                           address (which is mailed its own link).
 *
 * Anything that can make us send an email goes through screen() first.
 */

const SOMETHING_WRONG = "Something went wrong. Try again in a moment.";
const TOO_MANY = "Too many tries. Give it a few minutes.";

type Screened = { reply: ActionState } | { mail: boolean };

/**
 * The checks every form that mails a typed address runs (lib/spam-guard.ts),
 * in order of cost: the bot traps, then one shared pair of limits — per IP
 * and per address, across all of these forms — then the address's domain,
 * then a send from the site-wide hourly budget. `reply` short-circuits the
 * action: a bot's is the ordinary success, so it learns nothing.
 */
async function screen(form: FormData, email: string, label: string, minMs: number, success: ActionState): Promise<Screened> {
  const guard = guardForm(form, label, minMs);
  if (guard === "bot") return { reply: success };
  if (guard !== "ok") return { reply: { ok: false, error: GUARD_MESSAGES[guard] } };

  const ip = clientIp(await headers());
  const ipOk = await rateLimit("waitlist:ip", ip, 10, 15 * 60 * 1000);
  const emailOk = await rateLimit("waitlist:email", email, 3, 60 * 60 * 1000);
  if (!ipOk || !emailOk) return { reply: { ok: false, error: TOO_MANY } };
  if (!(await emailDomainAccepts(email))) {
    return { reply: { ok: false, error: BAD_DOMAIN, fieldErrors: { email: [BAD_DOMAIN] } } };
  }
  return { mail: await takeSignupMailBudget() };
}

/** After the response, so the reply takes the same time whatever happens to the address. */
function later(label: string, work: () => Promise<void>) {
  after(async () => {
    try {
      await work();
    } catch (err) {
      console.error(`[waitlist] ${label} failed:`, err);
    }
  });
}

const homepageEmail = z.object({ email: emailSchema });

/** The homepage box. Joins unconfirmed; the confirmation email does the rest. */
export async function joinWaitlistAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = homepageEmail.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { ok: false, error: "That doesn't look like an email" };
  const { email } = parsed.data;
  const done: ActionState = { ok: true };

  try {
    const screened = await screen(formData, email, "homepage", 1500, done);
    if ("reply" in screened) return screened.reply;
    // Over the hour's mail budget the row is kept and no email goes; the next
    // try after it recovers sends the link.
    later("homepage join", () => joinWaitlist(email, "landing", { mail: screened.mail }));
  } catch (err) {
    console.error("[waitlist] homepage join failed:", err);
    return { ok: false, error: SOMETHING_WRONG };
  }
  return done;
}

/** /signup: the application's answers are saved, then the address joins (or gets a sign-up link). */
export async function getStartedAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signupSurveySchema.safeParse(surveyFromForm(formData));
  if (!parsed.success) {
    return { ok: false, error: "Some answers need another look.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }
  const email = parsed.data.email;
  const open = signupEnabled();
  const done: ActionState = {
    ok: true,
    message: open
      ? "We've sent a link to finish creating your account. It works for 48 hours."
      : "Check your inbox and press the button in our email to confirm your place — until you do, you're not on the list. Already confirmed? Then there's nothing more to do.",
  };

  try {
    // Nobody fills the application in three seconds.
    const screened = await screen(formData, email, "signup application", 3000, done);
    if ("reply" in screened) return screened.reply;
    // A sign-up link is the whole point of the form once sign-ups are open,
    // so without one to send, say so rather than pretend.
    if (open && !screened.mail) return { ok: false, error: "We're getting a lot of sign-ups right now — try again in a few minutes." };
    // Saved before the reply: the answers are the point of the form. Never
    // over an existing account's own (see saveSignupSurvey).
    await saveSignupSurvey(parsed.data, "signup", { unlessAccount: true });
    later(open ? "sign-up link" : "application join", () =>
      open ? startSignup(email) : joinWaitlist(email, "signup", { mail: screened.mail }),
    );
  } catch (err) {
    console.error("[waitlist] application failed:", err);
    return { ok: false, error: SOMETHING_WRONG };
  }
  return done;
}

export type ConfirmState =
  | { ok: true; email: string; answered: boolean }
  | { ok: false; error: string }
  | null;

/**
 * The button on /waitlist/confirm. A POST, like unsubscribing: opening the
 * link alone does nothing, so a mail scanner that follows every link can't put
 * a stranger on the list.
 */
export async function confirmWaitlistAction(_prev: ConfirmState, formData: FormData): Promise<ConfirmState> {
  const token = formData.get("token");
  if (typeof token !== "string" || token.length < 10 || token.length > 100) {
    return { ok: false, error: "That link is incomplete — open it from the email again." };
  }
  try {
    if (!(await rateLimit("waitlist:confirm", clientIp(await headers()), 20, 15 * 60 * 1000))) {
      return { ok: false, error: TOO_MANY };
    }
    const done = await confirmWaitlist(token);
    if (!done) {
      return { ok: false, error: "That link has been used or has expired. Join again from the home page to get a new one." };
    }
    return { ok: true, email: done.email, answered: done.answered };
  } catch (err) {
    console.error("[waitlist] confirm failed:", err);
    return { ok: false, error: SOMETHING_WRONG };
  }
}

/**
 * /unsubscribe. With a token (from any of our emails, old or new) it acts at
 * once — off the waitlist and the newsletter. With a typed address it only
 * mails that address its own link, so nobody can unsubscribe a stranger; the
 * reply is the same whether the address is on the list or not.
 */
export async function unsubscribeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const token = formData.get("token");
  if (typeof token === "string" && token.length > 0) {
    try {
      if (!(await rateLimit("unsubscribe:ip", clientIp(await headers()), 20, 15 * 60 * 1000))) {
        return { ok: false, error: TOO_MANY };
      }
      // A link that matches no one is still the outcome they asked for.
      await unsubscribeByToken(token);
      return { ok: true, message: "You're unsubscribed — off the waitlist and the newsletter. We won't email you again." };
    } catch (err) {
      // A broken link isn't a transient fault; "try again" would loop forever.
      if (err instanceof InvalidUnsubscribeLink) {
        return { ok: false, error: "That unsubscribe link is incomplete — use the form below instead." };
      }
      console.error("[waitlist] unsubscribe failed:", err);
      return { ok: false, error: SOMETHING_WRONG };
    }
  }

  const parsed = homepageEmail.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { ok: false, error: "That doesn't look like an email" };
  const { email } = parsed.data;
  const done: ActionState = {
    ok: true,
    message: "If that address is on our list, we've emailed it a link to unsubscribe. One click there and you're off.",
  };
  try {
    const screened = await screen(formData, email, "unsubscribe link", 1500, done);
    if ("reply" in screened) return screened.reply;
    if (screened.mail) later("unsubscribe link", () => requestUnsubscribeLink(email));
  } catch (err) {
    console.error("[waitlist] unsubscribe link failed:", err);
    return { ok: false, error: SOMETHING_WRONG };
  }
  return done;
}
