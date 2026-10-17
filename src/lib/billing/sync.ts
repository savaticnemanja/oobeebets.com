import "server-only";
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, subscriptions, users, type SubscriptionStatus } from "@/db/schema";
import { tierForLookupKey } from "@/lib/tiers";
import { stripe } from "./stripe";

/** The subscription an event is about, or null for one this app ignores. */
export function subscriptionIdOf(event: Stripe.Event): string | null {
  const idOf = (v: string | { id: string } | null | undefined) => (typeof v === "string" ? v : (v?.id ?? null));
  switch (event.type) {
    case "checkout.session.completed":
      return event.data.object.mode === "subscription" ? idOf(event.data.object.subscription) : null;
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.paused":
    case "customer.subscription.resumed":
      return event.data.object.id;
    case "invoice.paid":
    case "invoice.payment_failed":
      return idOf(event.data.object.parent?.subscription_details?.subscription);
    default:
      return null;
  }
}

/**
 * Copy one Stripe Subscription into `subscriptions`.
 *
 * Reads the subscription itself rather than the event's snapshot, so a
 * retried, duplicated or out-of-order event can only ever write the current
 * state. The owner comes from the metadata checkout stamps on it, falling
 * back to whoever holds the Customer; a subscription made outside the app
 * (in the Dashboard, say) for someone with no account is skipped.
 */
export async function syncSubscription(subscriptionId: string): Promise<void> {
  const sub = await stripe().subscriptions.retrieve(subscriptionId, { expand: ["items.data.price"] });
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const item = sub.items.data[0];
  const tier = tierForLookupKey(item?.price.lookup_key);
  if (!item || !tier) {
    console.warn(`[billing] ${sub.id}: price ${item?.price.id ?? "none"} is not one of the plans — skipped`);
    return;
  }

  const userId = sub.metadata.user_id || (await userForCustomer(customerId));
  if (!userId) {
    console.warn(`[billing] ${sub.id}: no account for customer ${customerId} — skipped`);
    return;
  }

  const row = {
    userId,
    stripeCustomerId: customerId,
    tier,
    status: sub.status as SubscriptionStatus,
    stripePriceId: item.price.id,
    currentPeriodEnd: item.current_period_end ? new Date(item.current_period_end * 1000) : null,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    updatedAt: new Date(),
  };

  const [before] = await db
    .select({ tier: subscriptions.tier, status: subscriptions.status })
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, sub.id))
    .limit(1);

  await db
    .insert(subscriptions)
    .values({ stripeSubscriptionId: sub.id, ...row })
    .onConflictDoUpdate({ target: subscriptions.stripeSubscriptionId, set: row });

  // One audit line per change a person would care about, not per event.
  if (before?.tier !== tier || before?.status !== row.status) {
    await db.insert(auditLog).values({
      actorId: userId,
      action: "billing.subscription",
      entity: "subscription",
      entityId: sub.id,
      meta: { tier, status: row.status, from: before ?? null },
    });
  }
}

async function userForCustomer(customerId: string): Promise<string | null> {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.stripeCustomerId, customerId)).limit(1);
  return row?.id ?? null;
}
