import "server-only";
import type Stripe from "stripe";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, subscriptions, users, type SubscriptionStatus } from "@/db/schema";
import { PLAN } from "@/lib/plan";
import { stripe } from "./stripe";

const idOf = (v: string | { id: string } | null | undefined) => (typeof v === "string" ? v : (v?.id ?? null));
const dateOf = (s: number | null | undefined) => (s ? new Date(s * 1000) : null);

/** The subscription an event is about, or null for one this app ignores. */
export function subscriptionIdOf(event: Stripe.Event): string | null {
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

/** Act on one webhook event; a type this app doesn't handle does nothing. */
export async function syncEvent(event: Stripe.Event): Promise<void> {
  const id = subscriptionIdOf(event);
  if (id) await syncSubscription(id);
}

/**
 * Back from Checkout: copy the subscription it made straight away rather
 * than wait for the webhook, so the board is open on the very next page.
 * Only for the session's own account — the id comes in on a URL.
 */
export async function syncCheckoutSession(sessionId: string, userId: string): Promise<void> {
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return;
  const session = await stripe().checkout.sessions.retrieve(sessionId);
  if (session.client_reference_id !== userId || session.mode !== "subscription") return;
  const subscriptionId = idOf(session.subscription);
  if (subscriptionId) await syncSubscription(subscriptionId);
}

/**
 * Copy one Stripe Subscription into `subscriptions`.
 *
 * Reads the subscription itself rather than an event's snapshot, so a
 * retried, duplicated or out-of-order event can only ever write the current
 * state. The owner comes from the metadata checkout stamps on it, falling
 * back to whoever holds the Customer; a subscription made outside the app
 * (in the Dashboard, say) for someone with no account is skipped, as is one
 * on a price that isn't the plan's.
 */
export async function syncSubscription(subscriptionId: string): Promise<void> {
  const sub = await stripe().subscriptions.retrieve(subscriptionId, { expand: ["items.data.price"] });
  const customerId = idOf(sub.customer)!;
  const item = sub.items.data[0];
  if (!item || item.price.lookup_key !== PLAN.lookupKey) {
    console.warn(`[billing] ${sub.id}: price ${item?.price.id ?? "none"} is not the plan — skipped`);
    return;
  }

  const userId = (await existingUser(sub.metadata.user_id)) ?? (await userForCustomer(customerId));
  if (!userId) {
    console.warn(`[billing] ${sub.id}: no account for customer ${customerId} — skipped`);
    return;
  }

  const row = {
    userId,
    stripeCustomerId: customerId,
    status: sub.status as SubscriptionStatus,
    stripePriceId: item.price.id,
    trialEnd: dateOf(sub.trial_end),
    currentPeriodEnd: dateOf(item.current_period_end),
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    cancelAt: dateOf(sub.cancel_at),
    endedAt: dateOf(sub.ended_at),
    updatedAt: new Date(),
  };

  await db.transaction(async (tx) => {
    // The webhook and the return from Checkout can land at once; one at a
    // time per subscription keeps the audit trail to one line per change.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`subscription:${sub.id}`}))`);
    const [before] = await tx
      .select({ status: subscriptions.status, cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd, cancelAt: subscriptions.cancelAt })
      .from(subscriptions)
      .where(eq(subscriptions.stripeSubscriptionId, sub.id))
      .limit(1);

    await tx
      .insert(subscriptions)
      .values({ stripeSubscriptionId: sub.id, createdAt: dateOf(sub.created) ?? new Date(), ...row })
      .onConflictDoUpdate({ target: subscriptions.stripeSubscriptionId, set: row });

    // One audit line per change a person would care about, not per event.
    const cancelling = row.cancelAtPeriodEnd || row.cancelAt !== null;
    const wasCancelling = before ? before.cancelAtPeriodEnd || before.cancelAt !== null : false;
    if (before?.status !== row.status || cancelling !== wasCancelling) {
      await tx.insert(auditLog).values({
        actorId: userId,
        action: "billing.subscription",
        entity: "subscription",
        entityId: sub.id,
        meta: {
          status: row.status,
          cancelling,
          trialEnd: row.trialEnd?.toISOString() ?? null,
          periodEnd: row.currentPeriodEnd?.toISOString() ?? null,
          from: before ? { status: before.status, cancelling: wasCancelling } : null,
        },
      });
    }
  });
}

async function existingUser(id: string | undefined): Promise<string | null> {
  if (!id) return null;
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1);
  return row?.id ?? null;
}

async function userForCustomer(customerId: string): Promise<string | null> {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.stripeCustomerId, customerId)).limit(1);
  return row?.id ?? null;
}
