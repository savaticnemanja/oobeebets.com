import "server-only";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, gt, lt, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { notePresence } from "@/lib/presence";
import { sessions, users, rateLimits } from "@/db/schema";
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

/** Every session but this request's — a password change keeps you signed in here. */
export async function revokeOtherSessions(userId: string): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  await db
    .delete(sessions)
    .where(token ? and(eq(sessions.userId, userId), ne(sessions.tokenHash, hashToken(token))) : eq(sessions.userId, userId));
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

  // "Active today", for the admin overview: one insert per account per day.
  notePresence(row.user.id);

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

/**
 * The guard every admin *page* starts with. The layout checks too, but a
 * layout is not a guard: Next can render a page without re-running the layout
 * above it (on client navigation the router reuses the layout it already has,
 * and the request says which one that is). So each page checks for itself —
 * 404, as the layout does, so a non-admin never learns the route exists.
 */
export async function requireAdminPage(): Promise<AuthContext> {
  const auth = await getAuth();
  if (!auth?.isAdmin) notFound();
  return auth;
}

/**
 * The guard for the layout of a signed-in page that has a loading.tsx. The
 * page checks too, but it runs inside the loading boundary — after the
 * skeleton has gone out with a 200 — where a redirect can only be done by the
 * browser. Up here, outside the boundary, a signed-out visitor (or an expired
 * session) still gets a real redirect to sign in.
 */
export async function requireSignedInLayout(next: string): Promise<void> {
  if (!(await getAuth())) redirect(`/login?next=${next}`);
}

export function canManageRole(actor: AuthContext, target: User): boolean {
  // Any admin can promote or demote any other account, but never their own.
  // Self-demotion is the one move with no undo — it removes the very access
  // needed to reverse it — so it stays blocked even now that admins are
  // plural and another one could put it back.
  return actor.isAdmin && actor.user.id !== target.id;
}

/* --------------------------------------------------------- rate limiting */

export function clientIp(h: Headers): string {
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    "unknown"
  );
}

/**
 * Fixed-window counter in Postgres. Good enough at this scale and it needs no
 * extra infrastructure; swap the body for Redis if the app ever runs hot.
 * Returns true when the caller is allowed to proceed.
 */
export async function rateLimit(
  bucket: string,
  identifier: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowMs);

  // Scoped to this bucket. Sweeping the whole table with *this* caller's window
  // meant a short-window bucket deleted a long-window bucket's live rows, which
  // silently resets that limit to zero — harmless while every bucket here uses
  // fifteen minutes, and a hole the moment one doesn't. Each bucket collects
  // its own expired rows on its next call instead.
  await db
    .delete(rateLimits)
    .where(and(eq(rateLimits.bucket, bucket), lt(rateLimits.windowStart, windowStart)));

  const [row] = await db
    .insert(rateLimits)
    .values({ bucket, identifier, count: 1, windowStart: now })
    .onConflictDoUpdate({
      target: [rateLimits.bucket, rateLimits.identifier],
      set: {
        count: sql`case
          when ${rateLimits.windowStart} < ${windowStart.toISOString()}::timestamptz
          then 1
          else ${rateLimits.count} + 1
        end`,
        windowStart: sql`case
          when ${rateLimits.windowStart} < ${windowStart.toISOString()}::timestamptz
          then ${now.toISOString()}::timestamptz
          else ${rateLimits.windowStart}
        end`,
      },
    })
    .returning({ count: rateLimits.count });

  return (row?.count ?? 1) <= limit;
}
