"use server";

import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getAuth, rateLimit, type AuthContext } from "@/lib/auth";
import { liveSubscriptions } from "@/lib/billing/access";
import { BillingError, billingEnabled, stripe } from "@/lib/billing/stripe";
import { appUrl } from "@/lib/site";
import { TIERS, isTier } from "@/lib/tiers";
import type { ActionState } from "@/lib/validation";

/** Tags this flow's sessions in the Dashboard, to compare it with any later one. */
const INTEGRATION_ID = "oobee_tiers_kqvbmzta";

/**
 * Start a plan: off to Stripe Checkout. Nothing is unlocked here — the
 * webhook does that once Stripe has the payment (see lib/billing/sync.ts),
 * so a tab closed halfway through leaves nothing behind.
 *
 * Someone already on a plan changes it in the customer portal instead, so
 * nobody ends up paying for two.
 */
export async function startCheckoutAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await getAuth();
  if (!auth) redirect("/login?next=/pricing");
  if (!billingEnabled()) return { ok: false, error: "Plans aren't open yet." };
  if (auth.isAdmin) return { ok: false, error: "Admins already see the whole board." };

  const tier = formData.get("tier");
  if (!isTier(tier)) return { ok: false, error: "Pick a plan." };
  if (!(await rateLimit("billing:checkout", auth.user.id, 20, 60 * 60 * 1000))) {
    return { ok: false, error: "Too many tries — give it a few minutes." };
  }

  let url: string;
  try {
    if ((await liveSubscriptions(auth.user.id)).length > 0) {
      url = await portalUrl(auth);
    } else {
      const customer = await customerFor(auth);
      const prices = await stripe().prices.list({ lookup_keys: [TIERS[tier].lookupKey], active: true, limit: 1 });
      const price = prices.data[0];
      if (!price) throw new BillingError("That plan isn't available right now.");

      const session = await stripe().checkout.sessions.create({
        mode: "subscription",
        customer,
        client_reference_id: auth.user.id,
        line_items: [{ price: price.id, quantity: 1 }],
        // Stamped on the subscription, so the webhook knows whose it is
        // without a lookup.
        subscription_data: { metadata: { user_id: auth.user.id } },
        allow_promotion_codes: true,
        success_url: appUrl("/picks?subscribed=1"),
        cancel_url: appUrl("/pricing"),
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

/** Card, invoices, switching plan and cancelling: all in Stripe's customer portal. */
export async function openPortalAction(): Promise<ActionState> {
  const auth = await getAuth();
  if (!auth) redirect("/login?next=/account");
  if (!billingEnabled() || !auth.user.stripeCustomerId) return { ok: false, error: "You don't have a plan to manage." };

  let url: string;
  try {
    url = await portalUrl(auth);
  } catch (err) {
    return { ok: false, error: err instanceof BillingError ? err.message : "Couldn't reach Stripe — try again." };
  }
  redirect(url);
}

async function portalUrl(auth: AuthContext): Promise<string> {
  const session = await stripe().billingPortal.sessions.create({
    customer: await customerFor(auth),
    return_url: appUrl("/account"),
    // The configuration scripts/stripe-setup.mjs makes, which lets people
    // switch between the three plans; unset, the Dashboard's default.
    configuration: process.env.STRIPE_PORTAL_CONFIGURATION || undefined,
  });
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
