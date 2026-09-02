import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import type { User } from "@/db/schema";

export const SESSION_COOKIE = "oobee_session";
/** 30 days, sliding — every authenticated request extends it. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_REFRESH_THRESHOLD_MS = 24 * 60 * 60 * 1000;
const BCRYPT_ROUNDS = 12;

/* ------------------------------------------------------------- passwords */

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Burns the same CPU as a real verify. Called when an email does not exist, so
 * that a missing account and a wrong password take the same time to reject —
 * otherwise login timing enumerates the user list.
 *
 * The decoy hash is generated at first use rather than hardcoded: bcrypt
 * returns false immediately for a malformed hash, which would make this a
 * no-op and reintroduce the very timing gap it exists to close.
 */
let decoyHash: string | null = null;
export async function fakeVerify(plain: string): Promise<void> {
  decoyHash ??= await bcrypt.hash(randomBytes(16).toString("hex"), BCRYPT_ROUNDS);
  await bcrypt.compare(plain, decoyHash);
}

/* -------------------------------------------------------------- sessions */

/** Shared with invitations (see lib/invitations.ts) — same "hash the random
 * token, store only the hash" pattern as sessions. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const h = await headers();

  await db.insert(sessions).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    userAgent: h.get("user-agent")?.slice(0, 400) ?? null,
    ip: clientIp(h),
  });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    // A concrete maxAge (not a session cookie) is what makes "stay signed in"
    // survive a browser restart — FR-A4.
    maxAge: SESSION_TTL_MS / 1000,
  });

  return token;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    // Server-side revocation, not just a cleared cookie — FR-A6.
    await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  }
  jar.delete(SESSION_COOKIE);
}

/** Revoke every session for a user. Used on password change and admin action. */
export async function revokeAllSessions(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export interface AuthContext {
  user: User;
  isAdmin: boolean;
}

/**
 * Resolves the current request's user. `cache()` dedupes it across every
 * server component in a single render — the layout, the page and any nested
 * component share one query.
 */
export const getAuth = cache(async (): Promise<AuthContext | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const rows = await db
    .select({ user: users, session: sessions })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  // Sliding expiry, but only written once a day so a busy session does not
  // issue a write on every request.
  const remaining = row.session.expiresAt.getTime() - Date.now();
  if (SESSION_TTL_MS - remaining > SESSION_REFRESH_THRESHOLD_MS) {
    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() + SESSION_TTL_MS), lastSeenAt: new Date() })
      .where(eq(sessions.id, row.session.id));
  }

  return {
    user: row.user,
    isAdmin: row.user.role === "admin",
  };
});

/* ------------------------------------------------------------- guards */

export class AuthError extends Error {
  constructor(
    message: string,
    readonly code: "unauthenticated" | "forbidden",
  ) {
    super(message);
  }
}

export async function requireAuth(): Promise<AuthContext> {
  const auth = await getAuth();
  if (!auth) throw new AuthError("Sign in to continue", "unauthenticated");
  return auth;
}

export async function requireAdmin(): Promise<AuthContext> {
  const auth = await requireAuth();
  if (!auth.isAdmin) throw new AuthError("Admins only", "forbidden");
  return auth;
}

export function canManageRole(actor: AuthContext, target: User): boolean {
  // Any admin can promote or demote any other account, but never their own.
  // Self-demotion is the one move with no undo — it removes the very access
  // needed to reverse it — so it stays blocked even now that admins are
  // plural and another one could put it back.
  return actor.isAdmin && actor.user.id !== target.id;
}

/* --------------------------------------------------------- rate limiting */

/**
 * One implementation, in lib/rate-limit.ts, re-exported here so the actions
 * that already import it from this module keep working. It moved out because
 * the newsletter signup needs it too and has no session handling to speak of.
 */
import { clientIp, rateLimit } from "@/lib/rate-limit";

export { clientIp, rateLimit };
