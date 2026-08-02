"use server";

import { headers } from "next/headers";
import { clientIp, rateLimit } from "@/lib/auth";
import { subscribe, unsubscribeByEmail, unsubscribeByToken } from "@/lib/newsletter";
import { emailSchema, waitlistSchema, type ActionState } from "@/lib/validation";

const SUBSCRIBE_LIMIT = 5;
const SUBSCRIBE_WINDOW_MS = 15 * 60 * 1000;
const UNSUBSCRIBE_LIMIT = 10;
const UNSUBSCRIBE_WINDOW_MS = 15 * 60 * 1000;

export async function subscribeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ip = clientIp(await headers());
  if (!(await rateLimit("newsletter:subscribe", ip, SUBSCRIBE_LIMIT, SUBSCRIBE_WINDOW_MS))) {
    return { ok: false, error: "Too many attempts. Try again in a few minutes." };
  }

  const parsed = waitlistSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { ok: false, error: "That doesn't look like an email" };
  }

  try {
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
  const ip = clientIp(await headers());
  if (
    !(await rateLimit("newsletter:unsubscribe", ip, UNSUBSCRIBE_LIMIT, UNSUBSCRIBE_WINDOW_MS))
  ) {
    return { ok: false, error: "Too many attempts. Try again in a few minutes." };
  }

  const token = formData.get("token");

  try {
    if (typeof token === "string" && token.length > 0) {
      await unsubscribeByToken(token);
    } else {
      const parsed = emailSchema.safeParse(formData.get("email"));
      if (!parsed.success) {
        return { ok: false, error: "That doesn't look like an email" };
      }
      await unsubscribeByEmail(parsed.data);
    }
  } catch (err) {
    console.error("[newsletter] unsubscribe failed:", err);
    return { ok: false, error: "Something went wrong. Try again in a moment." };
  }

  // Success either way. Reporting "that address was not on the list" would
  // confirm membership to anyone willing to type an address in.
  return { ok: true };
}
