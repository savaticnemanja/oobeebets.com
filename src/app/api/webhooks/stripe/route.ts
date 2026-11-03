import { NextResponse } from "next/server";
import Stripe from "stripe";
import { syncEvent } from "@/lib/billing/sync";

/**
 * Stripe's webhook: keeps `subscriptions` in step with Stripe — a trial
 * starting, renewals paid or failed, cancellations and the end. The return
 * from Checkout copies the new subscription too (so the board opens on the
 * next page), but everything after that arrives here.
 *
 * Open to anyone, with no session: the signature is what keeps everyone but
 * Stripe out.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers.get("stripe-signature");
  if (!secret) return NextResponse.json({ error: "Webhook not configured" }, { status: 400 });
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  // The raw body: the signature is over the exact bytes Stripe sent.
  const body = await req.text();
  let event: Stripe.Event;
  try {
    // Static: checking a signature needs the endpoint secret, not an API key.
    event = Stripe.webhooks.constructEvent(body, signature, secret);
  } catch {
    return NextResponse.json({ error: "Bad signature" }, { status: 400 });
  }

  try {
    await syncEvent(event);
  } catch (err) {
    // A 500 makes Stripe retry, with backoff, for up to three days.
    console.error(`[billing] ${event.id} (${event.type}) failed`, err);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
