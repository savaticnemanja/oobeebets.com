import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/billing/stripe";
import { subscriptionIdOf, syncSubscription } from "@/lib/billing/sync";

/**
 * Stripe's webhook — the only writer of `subscriptions`. Checkout returning
 * someone to /picks unlocks nothing by itself; this does, when Stripe says
 * the subscription exists.
 *
 * Open past the beta gate (see ALWAYS_OPEN in middleware.ts): Stripe has no
 * gate cookie. The signature is what keeps everyone else out.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers.get("stripe-signature");
  if (!secret || !signature) return NextResponse.json({ error: "Not configured" }, { status: 400 });

  // The raw body: the signature is over the exact bytes Stripe sent.
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(body, signature, secret);
  } catch {
    return NextResponse.json({ error: "Bad signature" }, { status: 400 });
  }

  const subscriptionId = subscriptionIdOf(event);
  if (!subscriptionId) return NextResponse.json({ received: true });

  try {
    await syncSubscription(subscriptionId);
  } catch (err) {
    // A 500 makes Stripe retry, with backoff, for up to three days.
    console.error(`[billing] ${event.id} (${event.type}) failed`, err);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
