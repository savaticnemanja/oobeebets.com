import "server-only";
import { asc, sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  emailSchema,
  parseAddressList,
  type Audience,
} from "@/lib/validation";

/**
 * Turns a chosen audience into the addresses that will actually be mailed.
 *
 * Always re-derived here from the database rather than taken from the form.
 * The composer shows a count before the send is confirmed, but that count is
 * a *display*; if the client could also supply the list, a stale page (or a
 * forged post) would decide who receives a broadcast.
 */
export async function resolveAudience(
  audience: Audience,
  rawRecipients: string,
): Promise<{ recipients: string[]; invalid: string[] }> {
  if (audience === "custom") {
    const recipients: string[] = [];
    const invalid: string[] = [];

    for (const candidate of parseAddressList(rawRecipients)) {
      const parsed = emailSchema.safeParse(candidate);
      if (parsed.success) recipients.push(parsed.data);
      else invalid.push(candidate);
    }

    return { recipients, invalid };
  }

  const rows = await db
    .select({ email: users.email })
    .from(users)
    // "Testers" is everyone the beta is *for* — admins are the ones running it.
    // A suspended account gets no announcements.
    .where(audience === "testers" ? sql`${users.role} = 'user' and ${users.suspendedAt} is null` : sql`${users.suspendedAt} is null`)
    .orderBy(asc(users.email));

  return { recipients: rows.map((r) => r.email), invalid: [] };
}

/** The account list the composer offers when building a custom list. */
export async function selectableRecipients(): Promise<
  { email: string; role: string }[]
> {
  return db
    .select({ email: users.email, role: users.role })
    .from(users)
    .orderBy(asc(users.email))
    .limit(500);
}
