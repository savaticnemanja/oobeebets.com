"use server";

import { headers } from "next/headers";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import {
  InvalidUnsubscribeLink,
  subscribe,
  unsubscribeByEmail,
  unsubscribeById,
} from "@/lib/newsletter";
import { emailSchema, waitlistSchema, type ActionState } from "@/lib/validation";

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

    // The outcome is intentionally discarded. "Already subscribed" and "just
    // subscribed" have to be indistinguishable from the outside, or the form
    // becomes an oracle for whether a given address is on the list.
    await subscribe(parsed.data.email);
  } catch (err) {
    console.error("[newsletter] subscribe failed:", err);
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
