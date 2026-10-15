import "server-only";
import { cache } from "react";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { subscriptions, type Subscription, type SubscriptionStatus } from "@/db/schema";
import type { AuthContext } from "@/lib/auth";
import { VISIBLE_PICKS } from "@/lib/board";
import { ACCESS, TIER_ORDER, type Access, type AccessRule } from "@/lib/tiers";
import { billingEnabled } from "./stripe";

/**
 * Statuses that still unlock the board. past_due keeps access while Stripe
 * retries the card (Smart Retries); once retries run out the subscription
 * goes canceled or unpaid and the viewer drops to free.
 */
export const LIVE_STATUSES = ["active", "trialing", "past_due"] as const satisfies readonly SubscriptionStatus[];

export interface ViewerAccess {
  /** The viewer's plan; null where plans don't apply (admins, billing off). */
  access: Access | null;
  rule: AccessRule;
  /** Their live subscription, if any — for the account page. */
  subscription: Subscription | null;
}

/** What every viewer gets with billing off: the free beta's whole board. */
const BETA_RULE: AccessRule = { picks: VISIBLE_PICKS, parlays: true };

/**
 * What a viewer may see. Admins see everything (the board's own isAdmin
 * checks cover drafts); with billing off everyone sees the beta board; with
 * it on, the highest tier among their live subscriptions, or free.
 */
export const viewerAccess = cache(async (auth: AuthContext | null): Promise<ViewerAccess> => {
  if (auth?.isAdmin) return { access: null, rule: ACCESS.elite, subscription: null };
  if (!billingEnabled()) return { access: null, rule: BETA_RULE, subscription: null };
  if (!auth) return { access: "free", rule: ACCESS.free, subscription: null };

  const live = await liveSubscriptions(auth.user.id);
  const best = live.sort((a, b) => TIER_ORDER.indexOf(b.tier) - TIER_ORDER.indexOf(a.tier))[0] ?? null;
  const access: Access = best?.tier ?? "free";
  return { access, rule: ACCESS[access], subscription: best };
});

export function liveSubscriptions(userId: string): Promise<Subscription[]> {
  return db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), inArray(subscriptions.status, LIVE_STATUSES)))
    .orderBy(desc(subscriptions.createdAt));
}
