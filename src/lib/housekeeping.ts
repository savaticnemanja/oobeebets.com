import "server-only";
import { lt } from "drizzle-orm";
import { db } from "@/db";
import { passwordResets, sessions } from "@/db/schema";
import { claim } from "@/lib/sync-claim";

/**
 * Deletes sign-ins and reset links that have expired. Nothing reads them —
 * getAuth and the reset form both check the expiry — but they would pile up
 * for good, each one a user agent and IP kept longer than the privacy page
 * says. Once a day, whichever process claims it first.
 */
export async function sweepExpired(): Promise<void> {
  if (!(await claim("sweep:expired", 24 * 60))) return;
  const now = new Date();
  const gone = await db.delete(sessions).where(lt(sessions.expiresAt, now)).returning({ id: sessions.id });
  await db.delete(passwordResets).where(lt(passwordResets.expiresAt, now));
  if (gone.length > 0) console.log(`[sweep] removed ${gone.length} expired session${gone.length === 1 ? "" : "s"}`);
}
