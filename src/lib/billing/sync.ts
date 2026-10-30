import "server-only";
import type Stripe from "stripe";
import { and, eq, isNull, max, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, passes, users } from "@/db/schema";
import { PASS, passWindow } from "@/lib/pass";
import { stripe } from "./stripe";

const idOf = (v: string | { id: string } | null | undefined) => (typeof v === "string" ? v : (v?.id ?? null));

/**
 * Act on one webhook event; a type this app doesn't handle does nothing.
 *
 * Each handler reads the object fresh from Stripe rather than trusting the
 * event's snapshot, so a retried, duplicated or out-of-order event can only
 * ever act on the current state.
 */
export async function syncEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      if (event.data.object.mode === "payment") await grantPass(event.data.object.id);
      return;
    case "charge.refunded":
      await revokePass(event.data.object.id);
      return;
  }
}

/**
 * A paid Checkout Session for the pass becomes a row in `passes`, starting
 * now or where the buyer's latest pass ends. The owner comes from the
 * metadata checkout stamps on the session, falling back to whoever holds the
 * Customer; a payment made outside the app for someone with no account is
 * skipped.
 */
async function grantPass(sessionId: string): Promise<void> {
  const session = await stripe().checkout.sessions.retrieve(sessionId, { expand: ["line_items.data.price"] });
  // Not paid yet: async_payment_succeeded brings it back when it is.
  if (session.payment_status !== "paid") return;

  const price = session.line_items?.data[0]?.price;
  if (price?.lookup_key !== PASS.lookupKey) {
    console.warn(`[billing] ${session.id}: price ${price?.id ?? "none"} is not the pass — skipped`);
    return;
  }

  const customerId = idOf(session.customer);
  const userId = (await existingUser(session.metadata?.user_id)) ?? (customerId ? await userForCustomer(customerId) : null);
  if (!userId || !customerId) {
    console.warn(`[billing] ${session.id}: no account for customer ${customerId ?? "none"} — skipped`);
    return;
  }

  await db.transaction(async (tx) => {
    // One grant per buyer at a time, so two passes paid at once still stack.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`pass:${userId}`}))`);
    const [done] = await tx
      .select({ id: passes.stripeCheckoutSessionId })
      .from(passes)
      .where(eq(passes.stripeCheckoutSessionId, session.id));
    if (done) return;

    const [{ latest }] = await tx
      .select({ latest: max(passes.endsAt) })
      .from(passes)
      .where(and(eq(passes.userId, userId), isNull(passes.refundedAt)));
    const { startsAt, endsAt } = passWindow(new Date(), latest);

    await tx.insert(passes).values({
      stripeCheckoutSessionId: session.id,
      userId,
      stripeCustomerId: customerId,
      stripePaymentIntentId: idOf(session.payment_intent),
      amountCents: session.amount_total ?? 0,
      startsAt,
      endsAt,
    });
    await tx.insert(auditLog).values({
      actorId: userId,
      action: "billing.pass",
      entity: "pass",
      entityId: session.id,
      meta: { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), amountCents: session.amount_total },
    });
  });
}

/** A fully refunded payment takes its pass back. A partial refund leaves it. */
async function revokePass(chargeId: string): Promise<void> {
  const charge = await stripe().charges.retrieve(chargeId);
  const paymentIntentId = idOf(charge.payment_intent);
  if (!charge.refunded || !paymentIntentId) return;

  const revoked = await db
    .update(passes)
    .set({ refundedAt: new Date() })
    .where(and(eq(passes.stripePaymentIntentId, paymentIntentId), isNull(passes.refundedAt)))
    .returning({ id: passes.stripeCheckoutSessionId, userId: passes.userId });
  for (const p of revoked) {
    await db.insert(auditLog).values({ actorId: p.userId, action: "billing.refund", entity: "pass", entityId: p.id });
  }
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
