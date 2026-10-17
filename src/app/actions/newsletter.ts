"use server";

import { after } from "next/server";
import { headers } from "next/headers";
import { clientIp, rateLimit } from "@/lib/auth";
import { InvalidUnsubscribeLink, unsubscribeByEmail, unsubscribeById } from "@/lib/newsletter";
import { joinWaitlist } from "@/lib/waitlist";
import { z } from "zod";
import { emailSchema, type ActionState } from "@/lib/validation";
import { BAD_DOMAIN, GUARD_MESSAGES, emailDomainAccepts, guardForm, takeSignupMailBudget } from "@/lib/spam-guard";

const waitlistSchema = z.object({ email: emailSchema });

const SUBSCRIBE_LIMIT = 5;
const SUBSCRIBE_WINDOW_MS = 15 * 60 * 1000;
const UNSUBSCRIBE_LIMIT = 10;
const UNSUBSCRIBE_WINDOW_MS = 15 * 60 * 1000;

export async function subscribeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  // Before the rate limiter, so a malformed address is rejected without
  // touching the database or Resend at all.
  const parsed = waitlistSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { ok: false, error: "That doesn't look like an email" };
  }

  // Bots (lib/spam-guard.ts): a filled decoy or a forged token is told it
  // worked and nothing happens; a post faster than a person types is refused.
  const guard = guardForm(formData, "launch list", 1500);
  if (guard === "bot") return { ok: true };
  if (guard !== "ok") return { ok: false, error: GUARD_MESSAGES[guard] };

  // Everything below leaves the process — the limiter to Postgres, the signup
  // itself to Resend — and an action that throws takes the whole page to the
  // error boundary. A signup form is the wrong place to lose the page over a
  // database blip or a provider outage; the reachable failure is an inline
  // message the visitor can retry.
  try {
    const ip = clientIp(await headers());
    if (
      !(await rateLimit("newsletter:subscribe", ip, SUBSCRIBE_LIMIT, SUBSCRIBE_WINDOW_MS))
    ) {
      return { ok: false, error: "Too many attempts. Try again in a few minutes." };
    }
    // Per address too, so nobody can be signed up (and mailed) over and over.
    if (!(await rateLimit("newsletter:email", parsed.data.email, 3, 60 * 60 * 1000))) {
      return { ok: false, error: "Too many attempts. Try again in a few minutes." };
    }
    if (!(await emailDomainAccepts(parsed.data.email))) {
      return { ok: false, error: BAD_DOMAIN };
    }

    // Since 18 Oct 2026 the homepage box joins the waitlist (the launch list
    // was merged into it): unconfirmed, with a confirmation email. After the
    // response, like /signup, so the reply takes the same time whatever the
    // address — "already on it" and "just joined" can't be told apart. Over
    // the site-wide hour's budget the row is kept and no email goes.
    const email = parsed.data.email;
    const mail = await takeSignupMailBudget();
    after(async () => {
      try {
        await joinWaitlist(email, "landing", { mail });
      } catch (err) {
        console.error("[launch list] waitlist join failed:", err);
      }
    });
  } catch (err) {
    console.error("[launch list] sign-up failed:", err);
    return { ok: false, error: "Something went wrong. Try again in a moment." };
  }

  return { ok: true };
}

export async function unsubscribeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const token = formData.get("token");

  // Same shape as subscribeAction above: both the limiter and Resend can fail,
  // and someone trying to opt out is the last person who should be handed a
  // crash page.
  try {
    const ip = clientIp(await headers());
    if (
      !(await rateLimit(
        "newsletter:unsubscribe",
        ip,
        UNSUBSCRIBE_LIMIT,
        UNSUBSCRIBE_WINDOW_MS,
      ))
    ) {
      return { ok: false, error: "Too many attempts. Try again in a few minutes." };
    }

    if (typeof token === "string" && token.length > 0) {
      await unsubscribeById(token);
    } else {
      const parsed = emailSchema.safeParse(formData.get("email"));
      if (!parsed.success) {
        return { ok: false, error: "That doesn't look like an email" };
      }
      await unsubscribeByEmail(parsed.data);
    }
  } catch (err) {
    // A broken link is not a transient fault, so "try again in a moment" would
    // send them round the same loop forever. Point them at the form that does
    // not need the link instead.
    if (err instanceof InvalidUnsubscribeLink) {
      return {
        ok: false,
        error: "That unsubscribe link is incomplete — use the form below instead.",
      };
    }

    console.error("[newsletter] unsubscribe failed:", err);
    return { ok: false, error: "Something went wrong. Try again in a moment." };
  }

  // Success either way. Reporting "that address was not on the list" would
  // confirm membership to anyone willing to type an address in.
  return { ok: true };
}
