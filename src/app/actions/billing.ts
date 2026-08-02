"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { auditLog } from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import { billing, BillingError } from "@/lib/billing";
import { subscribe } from "@/lib/newsletter";
import { getSettings, seatsAvailable } from "@/lib/settings";
import { tierSchema, waitlistSchema, type ActionState } from "@/lib/validation";
import { appUrl } from "@/lib/site";

export async function subscribeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await requireAuth().catch(() => null);
  if (!auth) redirect(`/login?next=/pricing`);

  const tier = tierSchema.safeParse(formData.get("tier"));
  if (!tier.success) return { ok: false, error: "Pick a plan" };

  // Seat cap is enforced here, server-side, not only in the UI (FR-C3).
  if (!(await seatsAvailable())) {
    return { ok: false, error: "We're at capacity right now. Join the waitlist below." };
  }

  const settings = await getSettings();
  const withTrial =
    formData.get("trial") === "1" && settings.trialsEnabled && !auth.user.hasUsedTrial;

  let url: string;
  try {
    const result = await billing().createCheckout({
      userId: auth.user.id,
      email: auth.user.email,
      tier: tier.data,
      withTrial,
      successUrl: appUrl("/picks"),
      cancelUrl: appUrl("/pricing"),
    });
    url = result.url;
  } catch (err) {
    if (err instanceof BillingError) return { ok: false, error: err.message };
    throw err;
  }

  await db.insert(auditLog).values({
    actorId: auth.user.id,
    actorEmail: auth.user.email,
    action: withTrial ? "billing.trial_started" : "billing.subscribed",
    entity: "subscription",
    meta: { tier: tier.data },
  });

  revalidatePath("/picks");
  revalidatePath("/account");
  redirect(url);
}

export async function cancelSubscriptionAction(): Promise<ActionState> {
  const auth = await requireAuth();
  try {
    await billing().cancelSubscription(auth.user.id);
  } catch (err) {
    if (err instanceof BillingError) return { ok: false, error: err.message };
    throw err;
  }
  await db.insert(auditLog).values({
    actorId: auth.user.id,
    actorEmail: auth.user.email,
    action: "billing.canceled",
    entity: "subscription",
  });
  revalidatePath("/account");
  return { ok: true, message: "Cancelled. You keep access until the period ends." };
}

export async function resumeSubscriptionAction(): Promise<ActionState> {
  const auth = await requireAuth();
  try {
    await billing().resumeSubscription(auth.user.id);
  } catch (err) {
    if (err instanceof BillingError) return { ok: false, error: err.message };
    throw err;
  }
  revalidatePath("/account");
  return { ok: true, message: "Subscription resumed." };
}

export async function changeTierAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await requireAuth();
  const tier = tierSchema.safeParse(formData.get("tier"));
  if (!tier.success) return { ok: false, error: "Pick a plan" };

  try {
    await billing().changeTier(auth.user.id, tier.data);
  } catch (err) {
    if (err instanceof BillingError) return { ok: false, error: err.message };
    throw err;
  }

  await db.insert(auditLog).values({
    actorId: auth.user.id,
    actorEmail: auth.user.email,
    action: "billing.tier_changed",
    entity: "subscription",
    meta: { tier: tier.data },
  });

  revalidatePath("/account");
  revalidatePath("/picks");
  return { ok: true, message: `You're on ${tier.data} now.` };
}

/**
 * The seat waitlist on the pricing page, for when the cap is reached.
 *
 * Shares the Resend contact book with the pre-launch list — one address, one
 * contact, whichever door they came through — but sends no welcome, since the
 * pre-launch email promises a launch notification and that is not what these
 * people asked for. Set `RESEND_SEGMENT_ID` if the two ever need mailing
 * separately.
 */
export async function joinWaitlistAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = waitlistSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { ok: false, error: "Enter a valid email" };

  // Resend is a network call now, not an insert, so it can fail in ways a
  // local table could not. Losing the page over it would be a poor trade for
  // someone who has just been told there is no room.
  try {
    await subscribe(parsed.data.email, { welcome: false });
  } catch (err) {
    console.error("[billing] waitlist join failed:", err);
    return { ok: false, error: "Something went wrong. Try again in a moment." };
  }

  return { ok: true, message: "You're on the list. We'll email when a seat opens." };
}
