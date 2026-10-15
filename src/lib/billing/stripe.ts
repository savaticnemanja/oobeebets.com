import "server-only";
import Stripe from "stripe";

/**
 * The one Stripe client. Server-only: STRIPE_SECRET_KEY never leaves the
 * server, and a restricted key (rk_…) with write access to Customers,
 * Checkout Sessions, Customer portal and Subscriptions, and read access to
 * Prices, is all this needs.
 */
let client: Stripe | null = null;

export function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new BillingError("Billing isn't set up on this deployment.");
  client ??= new Stripe(key, { apiVersion: "2026-08-26.dahlia", appInfo: { name: "oobeebets" } });
  return client;
}

/**
 * Whether plans are switched on. Both BILLING_ENABLED=1 and a key, so a
 * deployment with a key but no flag (or the reverse) behaves exactly as the
 * free beta did: the whole board, no pricing.
 */
export function billingEnabled(): boolean {
  return process.env.BILLING_ENABLED === "1" && Boolean(process.env.STRIPE_SECRET_KEY);
}

/** A message safe to show the person who hit it. */
export class BillingError extends Error {}
