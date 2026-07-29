import "server-only";
import type { BillingProvider } from "./provider";
import { BillingError } from "./provider";

/**
 * Stripe provider — the production path. Deliberately left unimplemented in the
 * POC, but written out so the work is scoped rather than discovered later.
 *
 * To switch on:
 *   1. `npm i stripe`
 *   2. Set STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, and one price id per tier
 *      (STRIPE_PRICE_BASE / _PRO / _ELITE — see lib/tiers.ts).
 *   3. Set BILLING_PROVIDER=stripe.
 *   4. Implement the four methods below with the calls named in each comment.
 *   5. Implement the webhook route (see src/app/api/webhooks/stripe/route.ts).
 *
 * Design constraints that must hold:
 *   - Subscription rows are written ONLY by the webhook handler, never here.
 *     createCheckout returns a URL and nothing else; the user is not subscribed
 *     until Stripe says so. This is what makes a closed browser tab mid-payment
 *     harmless.
 *   - Price rises are new Price objects. Never update a Price in place — that
 *     is what silently re-prices existing subscribers and destroys the
 *     grandfathering the business model depends on.
 *   - Webhook handlers must be idempotent: Stripe retries, and will deliver the
 *     same event more than once.
 */
export const stripeProvider: BillingProvider = {
  id: "stripe",
  isHosted: true,

  async createCheckout() {
    // stripe.checkout.sessions.create({
    //   mode: "subscription",
    //   customer: user.stripeCustomerId ?? undefined,
    //   customer_email: user.stripeCustomerId ? undefined : req.email,
    //   line_items: [{ price: priceIdFor(req.tier), quantity: 1 }],
    //   subscription_data: req.withTrial ? { trial_period_days: TRIAL_DAYS } : undefined,
    //   // Card required even on trial — the cheapest abuse control there is.
    //   payment_method_collection: "always",
    //   client_reference_id: req.userId,
    //   success_url: req.successUrl,
    //   cancel_url: req.cancelUrl,
    // })
    throw new BillingError("Stripe provider not implemented — set BILLING_PROVIDER=mock");
  },

  async createPortalSession() {
    // stripe.billingPortal.sessions.create({ customer, return_url })
    throw new BillingError("Stripe provider not implemented");
  },

  async cancelSubscription() {
    // stripe.subscriptions.update(id, { cancel_at_period_end: true })
    throw new BillingError("Stripe provider not implemented");
  },

  async resumeSubscription() {
    // stripe.subscriptions.update(id, { cancel_at_period_end: false })
    throw new BillingError("Stripe provider not implemented");
  },

  async changeTier() {
    // stripe.subscriptions.update(id, {
    //   items: [{ id: itemId, price: priceIdFor(tier) }],
    //   proration_behavior: "create_prorations",
    // })
    throw new BillingError("Stripe provider not implemented");
  },
};

/**
 * The complete set of events the app must handle. Anything not in this list can
 * be ignored safely.
 */
export const REQUIRED_WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
  "invoice.paid",
] as const;
