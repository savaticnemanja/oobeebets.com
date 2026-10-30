import type Stripe from "stripe";

/**
 * The events the webhook acts on (see sync.ts). A card payment completes
 * Checkout already paid; a slower method (a bank debit, say) completes it
 * unpaid and is paid later, in async_payment_succeeded. A full refund takes
 * the pass back. scripts/stripe-setup.mjs registers exactly these on the
 * endpoint.
 */
export const WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "charge.refunded",
] as const satisfies readonly Stripe.Event.Type[];
