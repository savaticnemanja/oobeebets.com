"use server";

import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getAuth, rateLimit, type AuthContext } from "@/lib/auth";
import { BillingError, billingEnabled, stripe } from "@/lib/billing/stripe";
import { appUrl } from "@/lib/site";
import { PASS } from "@/lib/pass";
import type { ActionState } from "@/lib/validation";

/** Tags this flow's sessions in the Dashboard, to compare it with any later one. */
const INTEGRATION_ID = "oobee_pass_r4wq8hxn";

/**
 * Buy a 14-day pass: off to Stripe Checkout, one payment, nothing that
 * renews. Nothing is unlocked here — the webhook does that once Stripe has
 * the payment (see lib/billing/sync.ts), so a tab closed halfway through
 * leaves nothing behind. Someone who already holds a pass can buy another;
 * it starts where theirs ends.
 */
export async function startCheckoutAction(): Promise<ActionState> {
  const auth = await getAuth();
  if (!auth) redirect("/login?next=/account");
  if (!billingEnabled()) return { ok: false, error: "Passes aren't on sale yet." };
  if (auth.isAdmin) return { ok: false, error: "Admins already see the whole board." };
  if (!(await rateLimit("billing:checkout", auth.user.id, 20, 60 * 60 * 1000))) {
    return { ok: false, error: "Too many tries — give it a few minutes." };
  }

  let url: string;
  try {
    const prices = await stripe().prices.list({ lookup_keys: [PASS.lookupKey], active: true, limit: 1 });
    const price = prices.data[0];
    if (!price) throw new BillingError("The pass isn't available right now.");

    const customer = await customerFor(auth);
    // A checkout left open in another tab could be paid as well as this one,
    // and that's two passes nobody meant to buy. Only the newest stays payable.
    const open = await stripe().checkout.sessions.list({ customer, status: "open", limit: 10 });
    await Promise.all(open.data.map((s) => stripe().checkout.sessions.expire(s.id)));

    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      customer,
      client_reference_id: auth.user.id,
      line_items: [{ price: price.id, quantity: 1 }],
      // Read back by the webhook, so it knows whose pass it is without a lookup.
      metadata: { user_id: auth.user.id },
      payment_intent_data: { metadata: { user_id: auth.user.id } },
      allow_promotion_codes: true,
      success_url: appUrl("/picks?paid=1"),
      cancel_url: appUrl("/account#plan"),
      integration_identifier: INTEGRATION_ID,
    });
    if (!session.url) throw new BillingError("Stripe didn't return a checkout page.");
    url = session.url;
  } catch (err) {
    return { ok: false, error: err instanceof BillingError ? err.message : "Couldn't reach Stripe — try again." };
  }
  redirect(url);
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
