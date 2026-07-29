import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { subscriptions, users } from "@/db/schema";
import type { Tier } from "@/db/schema";
import { getSettings, seatsAvailable } from "@/lib/settings";
import { TRIAL_DAYS } from "@/lib/tiers";
import { BillingError, type BillingProvider, type CheckoutRequest, type CheckoutResult, type PortalRequest } from "./provider";
import { getLiveSubscription } from "@/lib/auth";

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

/**
 * POC billing. Simulates what Stripe's webhooks would write, synchronously.
 *
 * The only thing this does that Stripe would not: it writes the subscription
 * row itself instead of waiting for `checkout.session.completed`. Every field
 * it writes is a field Stripe supplies, with the same meaning, so the rows are
 * indistinguishable to the rest of the app.
 */
export const mockProvider: BillingProvider = {
  id: "mock",
  isHosted: false,

  async createCheckout(req: CheckoutRequest): Promise<CheckoutResult> {
    if (!(await seatsAvailable())) {
      throw new BillingError("We're at capacity. Join the waitlist.");
    }

    const existing = await getLiveSubscription(req.userId);
    if (existing) throw new BillingError("You already have an active subscription.");

    const settings = await getSettings();
    const priceCents = settings.pricing[req.tier];
    const now = new Date();

    const [user] = await db.select().from(users).where(eq(users.id, req.userId)).limit(1);
    if (!user) throw new BillingError("User not found");

    // Trial eligibility is decided here and nowhere else, so there is exactly
    // one place to audit when trials get abused.
    const trial = req.withTrial && settings.trialsEnabled && !user.hasUsedTrial;

    await db.transaction(async (tx) => {
      await tx.insert(subscriptions).values({
        userId: req.userId,
        tier: req.tier,
        status: trial ? "trialing" : "active",
        priceCents,
        currentPeriodEnd: trial ? addDays(now, TRIAL_DAYS) : addDays(now, 30),
        trialEndsAt: trial ? addDays(now, TRIAL_DAYS) : null,
        stripeSubscriptionId: `mock_sub_${crypto.randomUUID()}`,
        stripePriceId: `mock_price_${req.tier}_${priceCents}`,
      });

      if (trial) {
        // Set once, never reset — one trial per account, forever.
        await tx
          .update(users)
          .set({ hasUsedTrial: true, updatedAt: new Date() })
          .where(eq(users.id, req.userId));
      }
    });

    return { url: `${req.successUrl}?checkout=success&tier=${req.tier}`, sessionId: null };
  },

  async createPortalSession(req: PortalRequest): Promise<CheckoutResult> {
    // Stripe would return a hosted portal URL. The POC has its own account page.
    return { url: req.returnUrl, sessionId: null };
  },

  async cancelSubscription(userId: string): Promise<void> {
    const sub = await getLiveSubscription(userId);
    if (!sub) throw new BillingError("No active subscription");
    // Cancel at period end — access continues until it expires (FR-T5).
    await db
      .update(subscriptions)
      .set({ cancelAtPeriodEnd: true, updatedAt: new Date() })
      .where(eq(subscriptions.id, sub.id));
  },

  async resumeSubscription(userId: string): Promise<void> {
    const sub = await getLiveSubscription(userId);
    if (!sub) throw new BillingError("No active subscription");
    await db
      .update(subscriptions)
      .set({ cancelAtPeriodEnd: false, updatedAt: new Date() })
      .where(eq(subscriptions.id, sub.id));
  },

  async changeTier(userId: string, tier: Tier): Promise<void> {
    const sub = await getLiveSubscription(userId);
    if (!sub) throw new BillingError("No active subscription");
    if (sub.tier === tier) return;

    const settings = await getSettings();
    await db
      .update(subscriptions)
      .set({
        tier,
        // Upgrades take the current price; a real Stripe upgrade would prorate.
        priceCents: settings.pricing[tier],
        stripePriceId: `mock_price_${tier}_${settings.pricing[tier]}`,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, sub.id));
  },
};

/**
 * Expires mock subscriptions whose period has elapsed. Stripe does this with
 * webhooks; here it runs opportunistically. Idempotent and cheap.
 */
export async function expireLapsedSubscriptions(): Promise<number> {
  const result = await db
    .update(subscriptions)
    .set({ status: "canceled", updatedAt: new Date() })
    .where(
      and(
        sql`${subscriptions.status} in ('trialing','active','past_due')`,
        sql`${subscriptions.currentPeriodEnd} < now()`,
        eq(subscriptions.cancelAtPeriodEnd, true),
      ),
    )
    .returning({ id: subscriptions.id });
  return result.length;
}
