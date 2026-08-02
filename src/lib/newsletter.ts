import "server-only";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { waitlist } from "@/db/schema";
import { sendEmail } from "@/lib/email";
import { welcomeEmail } from "@/lib/email/templates";

/**
 * The list operations, kept out of the server actions because two entry points
 * need them: the actions behind the forms, and the RFC 8058 endpoint Gmail
 * POSTs to when someone uses the native unsubscribe button.
 */

/** 256 bits, URL-safe. Long enough that guessing one is not a strategy. */
function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export type SubscribeOutcome =
  /** New address, or one returning after unsubscribing. Welcome mail sent. */
  | "subscribed"
  /** Already on the list and still subscribed. Nothing sent, nothing changed. */
  | "already";

/**
 * Adds an address to the list, or reinstates one that had opted out.
 *
 * Deliberately does not send a second welcome to an address that is already
 * subscribed: without that check, a form anyone can POST becomes a way to mail
 * a stranger's inbox on demand.
 */
export async function subscribe(email: string): Promise<SubscribeOutcome> {
  const [existing] = await db
    .select({
      id: waitlist.id,
      token: waitlist.unsubscribeToken,
      unsubscribedAt: waitlist.unsubscribedAt,
    })
    .from(waitlist)
    .where(eq(waitlist.email, email))
    .limit(1);

  if (existing && existing.unsubscribedAt === null) return "already";

  let token: string;

  if (existing) {
    // Coming back after opting out. The token is rotated so the unsubscribe
    // link in any old mail cannot silently remove them a second time.
    token = newToken();
    await db
      .update(waitlist)
      .set({ unsubscribedAt: null, unsubscribeToken: token })
      .where(eq(waitlist.id, existing.id));
  } else {
    token = newToken();
    const [row] = await db
      .insert(waitlist)
      .values({ email, unsubscribeToken: token })
      // Two simultaneous submissions of the same address: whichever loses the
      // race gets no row back and has nothing left to do.
      .onConflictDoNothing({ target: waitlist.email })
      .returning({ id: waitlist.id });

    if (!row) return "already";
  }

  await sendEmail({ to: email, ...welcomeEmail(token) });

  return "subscribed";
}

/**
 * Opts an address out by its link token. Returns false only when the token
 * matches nothing — an already-unsubscribed row still reports success, because
 * from the subscriber's side the outcome they asked for is the outcome they
 * have.
 */
export async function unsubscribeByToken(token: string): Promise<boolean> {
  const [row] = await db
    .update(waitlist)
    .set({ unsubscribedAt: new Date() })
    .where(eq(waitlist.unsubscribeToken, token))
    .returning({ email: waitlist.email });

  return Boolean(row);
}

/**
 * Opts out by typed address, for someone who no longer has the email.
 *
 * No confirmation step on purpose. The alternative — mailing a link to
 * somebody who has just told us they want less mail — is worse for the person
 * we would be protecting, and the worst a griefer achieves is removing a
 * stranger from a newsletter they can rejoin in one form submission.
 */
export async function unsubscribeByEmail(email: string): Promise<boolean> {
  const [row] = await db
    .update(waitlist)
    .set({ unsubscribedAt: new Date() })
    .where(eq(waitlist.email, email))
    .returning({ email: waitlist.email });

  return Boolean(row);
}
