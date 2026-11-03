"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type Stripe from "stripe";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getAuth, rateLimit, type AuthContext } from "@/lib/auth";
import { openSubscriptions, viewerAccess } from "@/lib/billing/access";
import { BillingError, billingEnabled, stripe } from "@/lib/billing/stripe";
import { syncSubscription } from "@/lib/billing/sync";
import { appUrl } from "@/lib/site";
import { PLAN } from "@/lib/plan";
import type { ActionState } from "@/lib/validation";

/** Tags this flow's sessions in the Dashboard, to compare it with any later one. */
const INTEGRATION_ID = "oobee_sub_trial_7cq2mfza";

/** Where a checkout was started from — and so where "Back" in Checkout returns to. */
export type CheckoutFrom = "signup" | "picks" | "settings";

const CANCEL_URL: Record<CheckoutFrom, string> = {
  signup: "/welcome",
  picks: "/picks",
  settings: "/settings#plan",
};

/**
 * Subscribe: off to Stripe Checkout, which takes the card and starts the
 * subscription — with the 14-day free trial for anyone who's never had one,
 * so nothing is charged today. Nothing is unlocked here: the return from
 * Checkout and the webhook do that once Stripe has the subscription (see
 * lib/billing/sync.ts), so a tab closed halfway through leaves nothing behind.
 *
 * Someone who already has a subscription is sent to manage it instead, so
 * nobody ends up paying for two.
 */
export async function startCheckoutAction(from: CheckoutFrom): Promise<ActionState> {
  // A server action's arguments come from the client: only a known origin counts.
  const back = Object.hasOwn(CANCEL_URL, from) ? CANCEL_URL[from] : "/picks";
  const auth = await getAuth();
  if (!auth) redirect(`/login?next=${encodeURIComponent(back)}`);
  if (!billingEnabled()) return { ok: false, error: "Subscriptions aren't open yet." };
  if (auth.isAdmin) return { ok: false, error: "Admins already see the whole board." };
  if (!(await rateLimit("billing:checkout", auth.user.id, 20, 60 * 60 * 1000))) {
    return { ok: false, error: "Too many tries — give it a few minutes." };
  }

  let url: string;
  try {
    if ((await openSubscriptions(auth.user.id)).length > 0) {
      url = await portalUrl(auth);
    } else {
      const prices = await stripe().prices.list({ lookup_keys: [PLAN.lookupKey], active: true, limit: 1 });
      const price = prices.data[0];
      if (!price) throw new BillingError("Subscriptions aren't available right now.");

      const hadCustomer = Boolean(auth.user.stripeCustomerId);
      const customer = await customerFor(auth);
      // The trial is once per account. Our own rows say so, and Stripe is
      // asked too in case a subscription was made outside the app.
      let trial = (await viewerAccess(auth)).trialEligible;
      if (trial && hadCustomer) {
        const before = await stripe().subscriptions.list({ customer, status: "all", limit: 1 });
        trial = before.data.length === 0;
      }

      // A checkout left open in another tab could be completed as well as
      // this one, and that's two subscriptions. Only the newest stays open.
      const open = await stripe().checkout.sessions.list({ customer, status: "open", limit: 10 });
      await Promise.all(open.data.map((s) => stripe().checkout.sessions.expire(s.id)));

      const session = await stripe().checkout.sessions.create({
        mode: "subscription",
        customer,
        client_reference_id: auth.user.id,
        line_items: [{ price: price.id, quantity: 1 }],
        // The card is taken up front even with a trial, so the first charge
        // just happens when the trial ends — and a trial without one ends.
        payment_method_collection: "always",
        subscription_data: {
          // Stamped on the subscription, so the webhook knows whose it is.
          metadata: { user_id: auth.user.id },
          ...(trial && {
            trial_period_days: PLAN.trialDays,
            trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
          }),
        },
        custom_text: {
          submit: {
            message: trial
              ? `Nothing is charged today. Cancel anytime in Settings — cancel before the ${PLAN.trialDays} days are up and you're never charged.`
              : "Cancel anytime in Settings; you keep access to the end of the period you've paid for.",
          },
        },
        allow_promotion_codes: true,
        // The site says $50; Checkout shouldn't say €46.46.
        adaptive_pricing: { enabled: false },
        success_url: appUrl(`/picks?subscribed=1&session_id={CHECKOUT_SESSION_ID}${from === "signup" ? "&welcome=1" : ""}`),
        cancel_url: appUrl(back),
        integration_identifier: INTEGRATION_ID,
      });
      if (!session.url) throw new BillingError("Stripe didn't return a checkout page.");
      url = session.url;
    }
  } catch (err) {
    return { ok: false, error: err instanceof BillingError ? err.message : "Couldn't reach Stripe — try again." };
  }
  redirect(url);
}

/** Card, invoices and receipts: Stripe's customer portal. */
export async function openPortalAction(): Promise<ActionState> {
  const auth = await getAuth();
  if (!auth) redirect("/login?next=/settings");
  if (!billingEnabled() || !auth.user.stripeCustomerId) return { ok: false, error: "You don't have a subscription to manage." };

  let url: string;
  try {
    url = await portalUrl(auth);
  } catch (err) {
    return { ok: false, error: err instanceof BillingError ? err.message : "Couldn't reach Stripe — try again." };
  }
  redirect(url);
}

/**
 * Cancel: no more charges, and the board stays open to the end of what's
 * paid for — or of the trial, which then never bills. Written to our copy
 * straight away (the webhook says the same a moment later).
 */
export async function cancelSubscriptionAction(): Promise<ActionState> {
  return changeCancellation(true);
}

/** Undo a cancellation that hasn't taken effect yet: it renews as before. */
export async function resumeSubscriptionAction(): Promise<ActionState> {
  return changeCancellation(false);
}

async function changeCancellation(cancel: boolean): Promise<ActionState> {
  const auth = await getAuth();
  if (!auth) redirect("/login?next=/settings");
  if (!billingEnabled()) return { ok: false, error: "Subscriptions aren't open yet." };
  if (!(await rateLimit("billing:cancel", auth.user.id, 20, 60 * 60 * 1000))) {
    return { ok: false, error: "Too many tries — give it a few minutes." };
  }

  const open = await openSubscriptions(auth.user.id);
  if (open.length === 0) return { ok: false, error: "You don't have a subscription to change." };
  try {
    for (const sub of open) {
      await stripe().subscriptions.update(
        sub.stripeSubscriptionId,
        // A cancellation set elsewhere (the Dashboard) can be a date rather
        // than the period's end; undoing either clears it.
        cancel ? { cancel_at_period_end: true } : sub.cancelAtPeriodEnd ? { cancel_at_period_end: false } : { cancel_at: "" },
      );
      await syncSubscription(sub.stripeSubscriptionId);
    }
  } catch (err) {
    console.error(`[billing] ${cancel ? "cancel" : "resume"} failed for ${auth.user.id}`, err);
    return { ok: false, error: "Couldn't reach Stripe — try again." };
  }
  revalidatePath("/settings");
  return {
    ok: true,
    message: cancel ? "Cancelled — you won't be charged again." : "You're subscribed again — nothing else changes.",
  };
}

/** A customer-portal session, back to Settings' Plan section. */
async function portalUrl(auth: AuthContext): Promise<string> {
  const params: Stripe.BillingPortal.SessionCreateParams = {
    customer: await customerFor(auth),
    return_url: appUrl("/settings#plan"),
    // Unset: the account's default configuration, which stripe:setup fills in.
    configuration: process.env.STRIPE_PORTAL_CONFIGURATION || undefined,
  };
  const session = await stripe().billingPortal.sessions.create(params);
  return session.url;
}

/**
 * The account's Stripe Customer, made on first use. The idempotency key
 * means two checkouts started at once still make one Customer; the
 * conditional update keeps the first one written.
 */
async function customerFor(auth: AuthContext): Promise<string> {
  if (auth.user.stripeCustomerId) return auth.user.stripeCustomerId;

  const customer = await stripe().customers.create(
    {
      email: auth.user.email,
      name: auth.user.displayName ?? undefined,
      metadata: { user_id: auth.user.id },
    },
    { idempotencyKey: `customer:${auth.user.id}` },
  );
  const [row] = await db
    .update(users)
    .set({ stripeCustomerId: customer.id })
    .where(and(eq(users.id, auth.user.id), isNull(users.stripeCustomerId)))
    .returning({ id: users.stripeCustomerId });
  if (row?.id) return row.id;

  const [current] = await db.select({ id: users.stripeCustomerId }).from(users).where(eq(users.id, auth.user.id));
  return current?.id ?? customer.id;
}
