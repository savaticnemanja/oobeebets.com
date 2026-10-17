import type Stripe from "stripe";

/**
 * The events the webhook acts on. Each one names a subscription, and every
 * one is handled the same way: read that subscription fresh from Stripe and
 * copy it into `subscriptions` (see sync.ts). scripts/stripe-setup.mjs
 * registers exactly these on the endpoint.
 */
export const WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "invoice.paid",
  "invoice.payment_failed",
] as const satisfies readonly Stripe.Event.Type[];
