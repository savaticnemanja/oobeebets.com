"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { headers } from "next/headers";
import { and, eq, gt, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditLog, passwordResets, rateLimits, sessions, users } from "@/db/schema";
import { clientIp, createSession, hashPassword, hashToken, rateLimit } from "@/lib/auth";
import { emailSchema, fieldErrorsFrom, passwordSchema, type ActionState } from "@/lib/validation";
import { idempotencyKey, sendEmail } from "@/lib/email/resend-client";
import { passwordResetEmail } from "@/lib/email/templates";
import { appUrl } from "@/lib/site";

/**
 * "Forgot password": an emailed link that lets you choose a new one. The beta
 * is invite-only, so without this a tester who forgot their password had no
 * way back in at all.
 */

/** Long enough to find the email, short enough that a forwarded one goes stale. */
const RESET_TTL_MIN = 60;

const SENT =
  "If an account uses that email, a reset link is on its way. Check your inbox (and spam) — it works for 60 minutes.";

export async function requestPasswordResetAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z.object({ email: emailSchema }).safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { ok: false, error: "Check the fields below", fieldErrors: fieldErrorsFrom(parsed.error) };
  }
  const { email } = parsed.data;
  const ip = clientIp(await headers());

  // Per address so nobody can flood someone's inbox, per IP so nobody can
  // walk a list. Both count unknown addresses like real ones.
  const emailOk = await rateLimit("reset:email", email, 3, 60 * 60 * 1000);
  const ipOk = await rateLimit("reset:ip", ip, 10, 60 * 60 * 1000);
  if (!emailOk || !ipOk) {
    return { ok: false, error: "Too many reset requests. Try again in an hour." };
  }

  // The lookup, the token and the send all happen after the response, so it
  // takes the same time — and says the same thing — whether or not the
  // address has an account.
  after(async () => {
    try {
      const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
      if (!user) return;

      const token = randomBytes(32).toString("base64url");
      const tokenHash = hashToken(token);
      const expiresAt = new Date(Date.now() + RESET_TTL_MIN * 60 * 1000);
      // One live link per account: asking again replaces the last one.
      await db
        .insert(passwordResets)
        .values({ userId: user.id, tokenHash, expiresAt })
        .onConflictDoUpdate({
          target: passwordResets.userId,
          set: { tokenHash, expiresAt, createdAt: new Date() },
        });

      const { subject, html, text } = passwordResetEmail({
        resetUrl: appUrl(`/reset-password/${token}`),
        minutes: RESET_TTL_MIN,
      });
      await sendEmail({
        to: email,
        subject,
        html,
        text,
        idempotencyKey: idempotencyKey("reset", tokenHash.slice(0, 32)),
      });
    } catch (err) {
      console.error("[reset] could not send a reset link:", err);
    }
  });

  return { ok: true, message: SENT };
}

const resetSchema = z
  .object({
    token: z.string().min(1).max(200),
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { message: "Passwords don't match", path: ["confirm"] });

export async function resetPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = resetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: "Check the fields below", fieldErrors: fieldErrorsFrom(parsed.error) };
  }
  const { token, password } = parsed.data;
  const ip = clientIp(await headers());

  if (!(await rateLimit("reset:submit", ip, 10, 15 * 60 * 1000))) {
    return { ok: false, error: "Too many attempts. Try again in 15 minutes." };
  }

  const passwordHash = await hashPassword(password);
  const tokenHash = hashToken(token);

  const done = await db.transaction(async (tx) => {
    // Deleting the row is what spends the link: two submissions of the same
    // one race here, and only the one whose delete returns a row goes on.
    const [reset] = await tx
      .delete(passwordResets)
      .where(and(eq(passwordResets.tokenHash, tokenHash), gt(passwordResets.expiresAt, new Date())))
      .returning({ userId: passwordResets.userId });
    if (!reset) return null;

    const [user] = await tx
      .update(users)
      .set({ passwordHash, failedLoginCount: 0, lockedUntil: null, updatedAt: new Date() })
      .where(eq(users.id, reset.userId))
      .returning({ id: users.id, email: users.email });

    // Signed out everywhere: if the password was reset because someone else
    // had it, their sessions end here.
    await tx.delete(sessions).where(eq(sessions.userId, user.id));
    // And the sign-in throttle starts afresh, so being throttled can't keep
    // them out of the account they just recovered.
    await tx
      .delete(rateLimits)
      .where(
        or(
          and(eq(rateLimits.bucket, "login:account"), eq(rateLimits.identifier, user.email)),
          and(eq(rateLimits.bucket, "login:email-ip"), eq(rateLimits.identifier, `${user.email} ${ip}`)),
        ),
      );
    await tx.insert(auditLog).values({
      actorId: user.id,
      actorEmail: user.email,
      action: "user.password_reset",
      entity: "user",
      entityId: user.id,
    });
    return user;
  });

  if (!done) return { ok: false, error: "This reset link isn't valid anymore. Ask for a new one." };

  await createSession(done.id);
  redirect("/home");
}
