import "server-only";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { passwordResets, users } from "@/db/schema";
import { hashToken } from "@/lib/auth";

/**
 * The account a reset link points at, if the link is still usable — for the
 * reset page, which shows the form or says the link has gone stale. The
 * action re-checks for itself when the form is posted.
 */
export async function findUsableReset(token: string): Promise<{ email: string } | null> {
  const [row] = await db
    .select({ email: users.email })
    .from(passwordResets)
    .innerJoin(users, eq(users.id, passwordResets.userId))
    .where(and(eq(passwordResets.tokenHash, hashToken(token)), gt(passwordResets.expiresAt, new Date())))
    .limit(1);
  return row ?? null;
}
