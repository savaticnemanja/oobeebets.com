"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { cookies } from "next/headers";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditLog, invitations, signupSurveys, users, waitlist } from "@/db/schema";
import { SESSION_COOKIE, getAuth, rateLimit, verifyPassword } from "@/lib/auth";
import { sendEmail } from "@/lib/email/resend-client";
import { accountDeletedEmail } from "@/lib/email/templates";
import { mirrorForget } from "@/lib/newsletter";
import { openSubscriptions } from "@/lib/billing/access";
import { stripe } from "@/lib/billing/stripe";
import { fieldErrorsFrom, type ActionState } from "@/lib/validation";

const deleteSchema = z.object({
  password: z.string().min(1, "Enter your password"),
  confirm: z.literal("yes", { error: "Tick the box to confirm" }),
});

/**
 * Deletes the signed-in account and everything hanging off it — profile,
 * posts, replies, likes, follows, parlays, takes, notifications, sessions —
 * by the cascades on users, plus what is keyed by email rather than id
 * (sign-up answers, waitlist, invites). Feedback and reports they filed stay,
 * with their name taken off (set null). The audit log keeps its rows but loses
 * their email. Oobee's own picks and results are untouched.
 *
 * Asks for the password again, and refuses while they're the only admin
 * left. A subscription is cancelled at Stripe first, straight away — if
 * Stripe can't be reached the account stays, so nobody is billed for an
 * account that's gone.
 */
export async function deleteAccountAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await getAuth();
  if (!auth) return { ok: false, error: "Your session expired — sign in again." };

  const parsed = deleteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: "Check the fields below", fieldErrors: fieldErrorsFrom(parsed.error) };
  }
  if (!(await rateLimit("account:delete", auth.user.id, 5, 15 * 60 * 1000))) {
    return { ok: false, error: "Too many attempts. Try again in 15 minutes." };
  }
  if (!(await verifyPassword(parsed.data.password, auth.user.passwordHash))) {
    return { ok: false, error: "Check the fields below", fieldErrors: { password: ["That isn't your password"] } };
  }

  const { id, email } = auth.user;
  if (auth.isAdmin) {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(users)
      .where(and(eq(users.role, "admin"), ne(users.id, id)));
    if (n === 0) return { ok: false, error: "You're the only admin. Make someone else an admin first." };
  }

  try {
    for (const sub of await openSubscriptions(id)) {
      // Our copy can lag Stripe: one already ended there needs nothing.
      const live = await stripe().subscriptions.retrieve(sub.stripeSubscriptionId);
      if (live.status !== "canceled" && live.status !== "incomplete_expired") {
        await stripe().subscriptions.cancel(sub.stripeSubscriptionId);
      }
    }
  } catch (err) {
    console.error(`[account] couldn't cancel ${id}'s subscription before deleting`, err);
    return { ok: false, error: "Couldn't cancel your subscription with Stripe, so nothing was deleted. Try again in a minute." };
  }

  await db.transaction(async (tx) => {
    // The log keeps what happened, not who they were.
    await tx.update(auditLog).set({ actorEmail: null }).where(eq(auditLog.actorId, id));
    await tx.execute(sql`update ${auditLog} set meta = meta - 'email' where meta ->> 'email' = ${email}`);
    await tx.delete(signupSurveys).where(eq(signupSurveys.email, email));
    await tx.delete(waitlist).where(eq(waitlist.email, email));
    await tx.delete(invitations).where(eq(invitations.email, email));
    await tx.insert(auditLog).values({ actorId: null, actorEmail: null, action: "user.deleted", entity: "user", entityId: id });
    await tx.delete(users).where(eq(users.id, id));
  });

  // Forgotten by the newsletter too — Settings promises everything goes.
  try {
    await mirrorForget(email);
  } catch (err) {
    console.error("[account] couldn't remove the Resend contact:", err);
  }

  // The sessions went with the account; the cookie goes too.
  (await cookies()).delete(SESSION_COOKIE);
  after(async () => {
    try {
      await sendEmail({ to: email, ...accountDeletedEmail() });
    } catch (err) {
      console.error("[account] could not send the deletion notice:", err);
    }
  });
  redirect("/account-deleted");
}
