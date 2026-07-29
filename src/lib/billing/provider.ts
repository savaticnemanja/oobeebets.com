import type { Tier } from "@/db/schema";

/**
 * The billing seam.
 *
 * Everything the app knows about payments is this interface. The POC ships a
 * mock provider that writes subscription rows directly; production swaps in
 * `stripe.ts`, which creates real Checkout Sessions and lets webhooks write the
 * same rows. No page, component or query changes in that swap — they only ever
 * read the `subscriptions` table, whose columns are already Stripe's.
 *
 * Two rules keep the seam honest:
 *   1. Subscription state is only ever *mirrored* from the provider, never
 *      authored by app logic outside this folder.
 *   2. The `subscriptions.status` enum is Stripe's status vocabulary verbatim.
 */
export interface CheckoutRequest {
  userId: string;
  email: string;
  tier: Tier;
  /** Whether to attach a trial. The caller has already checked eligibility. */
  withTrial: boolean;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutResult {
  /** Where to send the browser next. */
  url: string;
  /** Set by real providers; null for the mock. */
  sessionId: string | null;
}

export interface PortalRequest {
  userId: string;
  returnUrl: string;
}

export interface BillingProvider {
  readonly id: "mock" | "stripe";
  /** True when the provider needs the user redirected off-site. */
  readonly isHosted: boolean;

  createCheckout(req: CheckoutRequest): Promise<CheckoutResult>;

  /** Hosted billing management (card, cancel, tier change). */
  createPortalSession(req: PortalRequest): Promise<CheckoutResult>;

  /** Cancel at period end. */
  cancelSubscription(userId: string): Promise<void>;

  /** Resume a subscription that was set to cancel. */
  resumeSubscription(userId: string): Promise<void>;

  /** Immediate tier change; proration is the provider's problem. */
  changeTier(userId: string, tier: Tier): Promise<void>;
}

export class BillingError extends Error {}
