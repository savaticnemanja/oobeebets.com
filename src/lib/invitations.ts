import "server-only";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { invitations } from "@/db/schema";
import type { Invitation } from "@/db/schema";
import { hashToken } from "@/lib/auth";
import { idempotencyKey, sendEmail } from "@/lib/email/resend-client";
import { inviteEmail, signupLinkEmail } from "@/lib/email/templates";
import { appUrl } from "@/lib/site";

/** How long an invite link stays valid after it's sent (or resent). */
export const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/** A self-serve sign-up link: they asked for it just now, so it needn't last. */
export const SIGNUP_LINK_TTL_MS = 48 * 60 * 60 * 1000;

/**
 * Same shape as a session token: 32 random bytes, base64url-encoded. Only the
 * hash is ever stored, so a database leak yields no usable invite links.
 */
export function createInviteToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

/**
 * Raw lookup by token hash — callers (the accept action, the invite page)
 * decide for themselves whether the row they get back is still usable, since
 * "invalid" means different things to each (redirect vs. an error message).
 */
export async function lookupInvite(tokenHash: string): Promise<Invitation | null> {
  const [row] = await db
    .select()
    .from(invitations)
    .where(eq(invitations.tokenHash, tokenHash))
    .limit(1);
  return row ?? null;
}

/** True when an invite can still be turned into an account right now. */
export function isInviteUsable(invite: Invitation): boolean {
  return invite.status === "pending" && invite.expiresAt > new Date();
}

/**
 * Mints a fresh token, upserts the invitation row (keyed on email — so a
 * second invite to the same address is a resend, not a duplicate), and sends
 * it. `invitedBy` null is a self-serve sign-up (SIGNUP_ENABLED): the same row
 * and the same account form, with the sign-up email and a shorter link. The DB write happens before the send, so a failed send still leaves a
 * usable, up-to-date invite row rather than losing state on retry.
 */
export async function issueInvite(email: string, invitedBy: string | null): Promise<string> {
  const selfServe = invitedBy === null;
  const { token, tokenHash } = createInviteToken();
  const expiresAt = new Date(Date.now() + (selfServe ? SIGNUP_LINK_TTL_MS : INVITE_TTL_MS));

  const [invite] = await db
    .insert(invitations)
    .values({ email, tokenHash, status: "pending", invitedBy, expiresAt })
    .onConflictDoUpdate({
      target: invitations.email,
      set: {
        tokenHash,
        status: "pending",
        invitedBy,
        expiresAt,
        acceptedAt: null,
        acceptedUserId: null,
        updatedAt: new Date(),
      },
    })
    .returning({ id: invitations.id });

  const url = appUrl(`/invite/${token}`);
  const { subject, html, text } = selfServe
    ? signupLinkEmail({ signupUrl: url, hours: SIGNUP_LINK_TTL_MS / 3_600_000 })
    : inviteEmail({ inviteUrl: url, expiresAt });
  // Keyed on the token hash, so a retried send of *this* invite is dropped
  // while a resend — which mints a new token above — always goes out.
  await sendEmail({
    to: email,
    subject,
    html,
    text,
    idempotencyKey: idempotencyKey(selfServe ? "signup" : "invite", tokenHash.slice(0, 32)),
  });

  return invite.id;
}
