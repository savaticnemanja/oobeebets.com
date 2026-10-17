"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { cookies } from "next/headers";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditLog, invitations, signupSurveys, subscriptions, users, waitlist } from "@/db/schema";
import { SESSION_COOKIE, getAuth, rateLimit, verifyPassword } from "@/lib/auth";
import { LIVE_STATUSES } from "@/lib/billing/access";
import { sendEmail } from "@/lib/email/resend-client";
import { accountDeletedEmail } from "@/lib/email/templates";
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
 * Asks for the password again, and refuses while a paid plan would go on
 * billing or while they're the only admin left.
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
  const [livePlan] = await db
    .select({ id: subscriptions.stripeSubscriptionId })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, id),
        inArray(subscriptions.status, [...LIVE_STATUSES]),
        eq(subscriptions.cancelAtPeriodEnd, false),
      ),
    )
    .limit(1);
  if (livePlan) {
    return { ok: false, error: "Cancel your plan first (Plan, above), so it stops billing — then delete your account." };
  }
  if (auth.isAdmin) {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(users)
      .where(and(eq(users.role, "admin"), ne(users.id, id)));
    if (n === 0) return { ok: false, error: "You're the only admin. Make someone else an admin first." };
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
