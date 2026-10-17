"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditLog, invitations, users } from "@/db/schema";
import type { AuthContext } from "@/lib/auth";
import { clientIp, createSession, hashPassword, hashToken, rateLimit, requireAdmin } from "@/lib/auth";
import { isInviteUsable, issueInvite, lookupInvite } from "@/lib/invitations";
import { emailSchema, fieldErrorsFrom, onboardingSchema, type ActionState } from "@/lib/validation";
import { mintUsername } from "@/lib/social";
import { violates } from "@/lib/db-errors";
import { sendEmail } from "@/lib/email/resend-client";
import { welcomeEmail } from "@/lib/email/templates";
import { appUrl } from "@/lib/site";
import { hasSignupSurvey, removeFromWaitlist, saveSignupSurvey } from "@/lib/waitlist";
import { signupSurveySchema, surveyFromForm, type SignupSurvey } from "@/lib/signup-survey";

const ACCEPT_LIMIT = 10;
const ACCEPT_WINDOW_MS = 15 * 60 * 1000;

async function audit(
  actor: AuthContext,
  action: string,
  entityId: string,
  meta?: Record<string, unknown>,
) {
  await db.insert(auditLog).values({
    actorId: actor.user.id,
    actorEmail: actor.user.email,
    action,
    entity: "invitation",
    entityId,
    meta: meta ?? null,
  });
}

/* ------------------------------------------------------------------ send */

export async function sendInviteAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireAdmin();

  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) {
    return { ok: false, error: "Check the email", fieldErrors: { email: parsed.error.issues.map((i) => i.message) } };
  }
  const email = parsed.data;

  const [existingUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existingUser) {
    return { ok: false, error: "An account with that email already exists", fieldErrors: { email: ["Already registered"] } };
  }

  let inviteId: string;
  try {
    inviteId = await issueInvite(email, actor.user.id);
  } catch (err) {
    // issueInvite writes the row before sending, so a failed send still
    // changed what the admin list shows — revalidate here too, not just on
    // the success path below, or the page looks like nothing happened.
    revalidatePath("/admin/users");
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Could not send the invite: ${message}` };
  }

  await audit(actor, "invite.sent", inviteId, { email });
  revalidatePath("/admin/users");
  return { ok: true, message: `Invite sent to ${email}.` };
}

/* ---------------------------------------------------------------- resend */

export async function resendInviteAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireAdmin();

  const id = z.string().uuid().safeParse(formData.get("inviteId"));
  if (!id.success) return { ok: false, error: "Bad invite id" };

  const [existing] = await db.select().from(invitations).where(eq(invitations.id, id.data)).limit(1);
  if (!existing) return { ok: false, error: "Invite not found" };

  try {
    await issueInvite(existing.email, actor.user.id);
  } catch (err) {
    revalidatePath("/admin/users");
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Could not resend the invite: ${message}` };
  }

  await audit(actor, "invite.resent", id.data, { email: existing.email });
  revalidatePath("/admin/users");
  return { ok: true, message: `Invite resent to ${existing.email}.` };
}

/* ---------------------------------------------------------------- revoke */

export async function revokeInviteAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireAdmin();

  const id = z.string().uuid().safeParse(formData.get("inviteId"));
  if (!id.success) return { ok: false, error: "Bad invite id" };

  const [existing] = await db.select().from(invitations).where(eq(invitations.id, id.data)).limit(1);
  if (!existing) return { ok: false, error: "Invite not found" };

  await db
    .update(invitations)
    .set({ status: "revoked", updatedAt: new Date() })
    .where(eq(invitations.id, id.data));

  await audit(actor, "invite.revoked", id.data, { email: existing.email });
  revalidatePath("/admin/users");
  return { ok: true, message: "Invite revoked." };
}

/* ---------------------------------------------------------------- accept */

export async function acceptInviteAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = onboardingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: "Check the fields below", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const h = await headers();
  const ip = clientIp(h);
  if (!(await rateLimit("invite:accept", ip, ACCEPT_LIMIT, ACCEPT_WINDOW_MS))) {
    return { ok: false, error: "Too many attempts. Try again in 15 minutes." };
  }

  const { token, password, name, phone, spendBand } = parsed.data;

  // The posted `email` is a hidden field mirroring what the server already
  // resolved — it's for the client's display, not trusted here. The account
  // is created from the invite row the token itself resolves to.
  const invite = await lookupInvite(hashToken(token));
  if (!invite || !isInviteUsable(invite)) {
    return { ok: false, error: "This invite link isn't valid anymore." };
  }

  // Admin invites skip /signup, so the application is asked here — unless
  // this address already answered it there.
  let survey: SignupSurvey | null = null;
  if (!(await hasSignupSurvey(invite.email))) {
    const s = signupSurveySchema.safeParse({ ...surveyFromForm(formData), email: invite.email });
    if (!s.success) {
      return { ok: false, error: "Check the fields below", fieldErrors: fieldErrorsFrom(s.error) };
    }
    survey = s.data;
  }

  const passwordHash = await hashPassword(password);

  let created: { id: string; email: string } | undefined;
  // Two attempts: a handle is minted free, but another signup can claim the
  // same one in the instant before this insert. The second mint sees it taken.
  for (let attempt = 0; attempt < 2 && !created; attempt++) try {
    [created] = await db
      .insert(users)
      .values({
        email: invite.email,
        passwordHash,
        displayName: name,
        username: await mintUsername(name, invite.email),
        phone,
        monthlySpendBand: spendBand,
        role: "user",
        // Clicking a link mailed to this address is a real verification signal.
        emailVerifiedAt: new Date(),
        // The schema refused the form without the 21+ / Terms box ticked.
        termsAcceptedAt: new Date(),
      })
      .returning({ id: users.id, email: users.email });
  } catch (err) {
    if (violates(err, "users_email_unique")) {
      // A concurrent submission of the same invite link won the race.
      return { ok: false, error: "This invite has already been used." };
    }
    if (violates(err, "users_username_unique") && attempt === 0) continue;
    throw err;
  }

  if (!created) return { ok: false, error: "Could not create the account" };

  await db
    .update(invitations)
    .set({ status: "accepted", acceptedUserId: created.id, acceptedAt: new Date(), updatedAt: new Date() })
    .where(eq(invitations.id, invite.id));

  await db.insert(auditLog).values({
    actorId: created.id,
    actorEmail: created.email,
    action: "user.onboarded",
    entity: "user",
    entityId: created.id,
    meta: { invitationId: invite.id, selfServe: invite.invitedBy === null },
  });

  if (survey) await saveSignupSurvey(survey, "invite");

  // They're in: nothing left to wait for. And the welcome goes after the
  // response, so a slow or failed send never stands between them and the board.
  await removeFromWaitlist(created.email);
  const welcomeTo = created.email;
  after(async () => {
    try {
      await sendEmail({
        to: welcomeTo,
        ...welcomeEmail({ name, homeUrl: appUrl("/home"), accountUrl: appUrl("/account") }),
      });
    } catch (err) {
      console.error("[welcome] could not send:", err);
    }
  });

  await createSession(created.id);
  redirect("/home?welcome=1");
}
