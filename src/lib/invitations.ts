import "server-only";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { invitations } from "@/db/schema";
import type { Invitation } from "@/db/schema";
import { hashToken } from "@/lib/auth";

/** How long an invite link stays valid after it's sent (or resent). */
export const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

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
