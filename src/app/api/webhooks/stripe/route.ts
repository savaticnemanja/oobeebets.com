import { NextResponse } from "next/server";

/**
 * Stripe webhook endpoint — the ONLY place subscription rows may be written in
 * production. Deliberately unimplemented in the POC; the contract is spelled
 * out so wiring it is mechanical.
 *
 * Implementation checklist:
 *
 *  1. Read the raw body (`await req.text()`) — NOT parsed JSON. Signature
 *     verification hashes the exact bytes Stripe sent.
 *  2. `stripe.webhooks.constructEvent(raw, req.headers.get("stripe-signature"),
 *     process.env.STRIPE_WEBHOOK_SECRET)`. Reject anything that fails.
 *  3. Handle, idempotently (Stripe retries and can deliver duplicates — key off
 *     `event.id` in a processed-events table, or make every write an upsert on
 *     stripe_subscription_id):
 *
 *       checkout.session.completed      -> create the subscription row,
 *                                          store stripe_customer_id on the user
 *       customer.subscription.created   -> upsert
 *       customer.subscription.updated   -> mirror status, tier (from price id),
 *                                          current_period_end, cancel_at_period_end
 *       customer.subscription.deleted   -> status = 'canceled'
 *       invoice.payment_failed          -> status = 'past_due'
 *       invoice.paid                    -> status = 'active'
 *
 *  4. Return 200 quickly. Anything slow belongs in a queue — Stripe times out
 *     and retries, which turns a slow handler into duplicate deliveries.
 *  5. Map price id -> tier via STRIPE_PRICE_BASE / _PRO / _ELITE. Keep the map
 *     additive: old price ids must keep resolving after a price rise, or
 *     grandfathered subscribers stop mapping to a tier.
 *
 * Note this route must stay out of any auth middleware matcher — Stripe calls
 * it without a session cookie.
 */
export async function POST() {
  return NextResponse.json(
    { error: "Stripe webhooks are not enabled in this build" },
    { status: 501 },
  );
}
