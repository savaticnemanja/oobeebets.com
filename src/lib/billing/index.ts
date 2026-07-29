import "server-only";
import { mockProvider } from "./mock";
import { stripeProvider } from "./stripe";
import type { BillingProvider } from "./provider";

/**
 * One switch decides the payment backend for the whole app.
 * BILLING_PROVIDER=mock (POC default) | stripe
 */
export function billing(): BillingProvider {
  return process.env.BILLING_PROVIDER === "stripe" ? stripeProvider : mockProvider;
}

export * from "./provider";
