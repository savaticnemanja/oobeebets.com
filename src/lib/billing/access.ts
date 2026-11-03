import "server-only";
import { cache } from "react";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { subscriptions, type Subscription } from "@/db/schema";
import type { AuthContext } from "@/lib/auth";
import { VISIBLE_PICKS } from "@/lib/board";
import { ACCESS, LIVE_STATUSES, OPEN_STATUSES, type Access, type AccessRule } from "@/lib/plan";
import { billingEnabled } from "./stripe";

export interface ViewerAccess {
  /** The viewer's access; null where the plan doesn't apply (admins, billing off). */
  access: Access | null;
  rule: AccessRule;
  /** Their subscription, if they have one still open (live, or a failed renewal). */
  subscription: Subscription | null;
  /** Whether a new subscription would start with the free trial (they never had one). */
  trialEligible: boolean;
}

/** What every viewer gets with billing off: the whole board, free. */
const OPEN_RULE: AccessRule = { picks: VISIBLE_PICKS, parlays: true };

/**
 * What a viewer may see. Admins see everything (the board's own isAdmin
 * checks cover drafts); with billing off everyone sees the whole board; with
 * it on, the whole board while a subscription is trialing or paid up, and
 * only settled picks otherwise.
 */
export const viewerAccess = cache(async (auth: AuthContext | null): Promise<ViewerAccess> => {
  if (auth?.isAdmin) return { access: null, rule: ACCESS.subscriber, subscription: null, trialEligible: false };
  if (!billingEnabled()) return { access: null, rule: OPEN_RULE, subscription: null, trialEligible: false };
  if (!auth) return { access: "free", rule: ACCESS.free, subscription: null, trialEligible: true };

  const rows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, auth.user.id))
    .orderBy(desc(subscriptions.createdAt));
  const live = rows.find((r) => (LIVE_STATUSES as readonly string[]).includes(r.status)) ?? null;
  const open = live ?? rows.find((r) => (OPEN_STATUSES as readonly string[]).includes(r.status)) ?? null;
  return {
    access: live ? "subscriber" : "free",
    rule: live ? ACCESS.subscriber : ACCESS.free,
    subscription: open,
    // Only someone who never got as far as a trial or a payment gets one.
    trialEligible: !rows.some((r) => r.trialEnd !== null || r.status !== "incomplete_expired"),
  };
});

/** For each of these accounts with a live subscription: its row. */
export async function liveSubscriptions(userIds: string[]): Promise<Map<string, Subscription>> {
  if (userIds.length === 0) return new Map();
  const rows = await db
    .select()
    .from(subscriptions)
    .where(and(inArray(subscriptions.userId, userIds), inArray(subscriptions.status, [...LIVE_STATUSES])));
  return new Map(rows.map((r) => [r.userId, r]));
}

/** This account's subscriptions that still bill or could (anything not ended). */
export async function openSubscriptions(userId: string): Promise<Subscription[]> {
  return db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), inArray(subscriptions.status, [...OPEN_STATUSES])));
}
