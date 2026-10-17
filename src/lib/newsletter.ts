import "server-only";
import { and, eq, inArray, isNotNull, lt } from "drizzle-orm";
import { db } from "@/db";
import { waitlist } from "@/db/schema";
import { resendClient } from "@/lib/email/resend-client";
import { planNewsletterSync } from "@/lib/newsletter-plan";
import { claim } from "@/lib/sync-claim";

/**
 * The newsletter: Resend's "Waitlist" segment, kept as a mirror of the
 * confirmed waitlist so a broadcast sent from Resend reaches exactly the people
 * on it. The waitlist (lib/waitlist.ts) stays the list — this file only copies
 * it across, and carries the one change that flows back: someone who
 * unsubscribes through a Resend broadcast's link comes off the waitlist too.
 *
 *  - Confirming a place subscribes the address here (mirrorSubscribe).
 *  - Unsubscribing anywhere — our emails' links, the old launch-list links,
 *    /unsubscribe — marks the contact unsubscribed (mirrorUnsubscribe). The
 *    contact stays at Resend as the record that they opted out.
 *  - Deleting an account forgets the contact altogether (mirrorForget).
 *  - syncNewsletter, hourly, mends anything a failed call left behind, and
 *    pulls in unsubscribes made at Resend.
 *
 * With no RESEND_API_KEY (dev, CI) every function here does nothing.
 */

/** RESEND_SEGMENT_ID, or the older RESEND_AUDIENCE_ID — audiences are segments now. */
const SEGMENT_ID = process.env.RESEND_SEGMENT_ID || process.env.RESEND_AUDIENCE_ID || null;
const enabled = () => Boolean(process.env.RESEND_API_KEY);

/** Resend allows two requests a second; the sync spaces its writes to stay under it. */
const pause = () => new Promise((r) => setTimeout(r, 600));

function fail(what: string, error: { name: string; message: string }): never {
  throw new Error(`Resend ${what} failed: ${error.name} — ${error.message}`);
}

/** Subscribed, and in the segment. Every step is idempotent at Resend. */
export async function mirrorSubscribe(email: string): Promise<void> {
  if (!enabled()) return;
  const contacts = resendClient().contacts;
  // Create returns the existing contact if there is one, but leaves its
  // unsubscribed flag alone — so a rejoin needs the update as well.
  const created = await contacts.create({ email, unsubscribed: false, ...(SEGMENT_ID ? { segments: [{ id: SEGMENT_ID }] } : {}) });
  if (created.error) fail("contacts.create", created.error);
  const updated = await contacts.update({ email, unsubscribed: false });
  if (updated.error) fail("contacts.update", updated.error);
  if (SEGMENT_ID) {
    const added = await contacts.segments.add({ email, segmentId: SEGMENT_ID });
    if (added.error) fail("contacts.segments.add", added.error);
  }
}

/** Unsubscribed (a contact that doesn't exist is already as unsubscribed as it gets). */
export async function mirrorUnsubscribe(email: string): Promise<void> {
  if (!enabled()) return;
  const { error } = await resendClient().contacts.update({ email, unsubscribed: true });
  if (error && error.name !== "not_found") fail("contacts.update", error);
}

/** Gone from Resend entirely — for account deletion, which promises to forget them. */
export async function mirrorForget(email: string): Promise<void> {
  if (!enabled()) return;
  const { error } = await resendClient().contacts.remove({ email });
  if (error && error.name !== "not_found") fail("contacts.remove", error);
}

export class InvalidUnsubscribeLink extends Error {
  constructor() {
    super("The unsubscribe link is malformed");
    this.name = "InvalidUnsubscribeLink";
  }
}

/**
 * The address behind a Resend contact id — what the old launch-list emails
 * carry in their unsubscribe links. Null for an id that matches nobody; a
 * malformed id throws InvalidUnsubscribeLink (Resend answers validation_error),
 * so a truncated link is reported rather than quietly "succeeding".
 */
export async function contactEmail(contactId: string): Promise<string | null> {
  if (!enabled()) return null;
  const { data, error } = await resendClient().contacts.get({ id: contactId });
  if (error) {
    if (error.name === "not_found") return null;
    if (error.name === "validation_error") throw new InvalidUnsubscribeLink();
    fail("contacts.get", error);
  }
  return data?.email?.toLowerCase() ?? null;
}

/** A subscribed contact's id, for an unsubscribe link mailed to someone not on the waitlist (an account holder). */
export async function contactIdFor(email: string): Promise<string | null> {
  if (!enabled()) return null;
  const { data, error } = await resendClient().contacts.get({ email });
  if (error) {
    if (error.name === "not_found") return null;
    fail("contacts.get", error);
  }
  return data && !data.unsubscribed ? data.id : null;
}

/** Every page of a contacts listing (all contacts, or one segment's). */
async function listAll(segmentId?: string): Promise<{ email: string; unsubscribed: boolean }[]> {
  const out: { email: string; unsubscribed: boolean }[] = [];
  let after: string | undefined;
  for (;;) {
    const { data, error } = await resendClient().contacts.list({ limit: 100, ...(after ? { after } : {}), ...(segmentId ? { segmentId } : {}) });
    if (error) fail("contacts.list", error);
    const page = data?.data ?? [];
    out.push(...page.map((c) => ({ email: c.email.toLowerCase(), unsubscribed: c.unsubscribed })));
    if (!data?.has_more || page.length === 0) return out;
    after = page[page.length - 1].id;
    await pause();
  }
}

/**
 * Brings Resend's segment in line with the confirmed waitlist, and the
 * waitlist in line with unsubscribes made at Resend. Hourly from the results
 * poller (a claim keeps it to one process), and on demand before the
 * "sign-ups are open" email goes out. See planNewsletterSync for the rules.
 */
export async function syncNewsletter({ force = false }: { force?: boolean } = {}): Promise<void> {
  if (!enabled()) return;
  if (!force && !(await claim("sync:newsletter", 55))) return;

  const started = new Date();
  const rows = await db
    .select({ email: waitlist.email, mirroredAt: waitlist.mirroredAt })
    .from(waitlist)
    .where(and(isNotNull(waitlist.confirmedAt), lt(waitlist.confirmedAt, started)));
  const [contacts, members] = await Promise.all([listAll(), SEGMENT_ID ? listAll(SEGMENT_ID) : Promise.resolve([])]);
  const plan = planNewsletterSync(rows, contacts, new Set(members.map((m) => m.email)));

  for (const email of [...plan.create, ...plan.resubscribe, ...plan.addToSegment]) {
    try {
      await mirrorSubscribe(email);
      plan.markMirrored.push(email);
    } catch (err) {
      console.error(`[newsletter] couldn't mirror ${email}:`, err);
    }
    await pause();
  }
  if (plan.markMirrored.length > 0) {
    await db.update(waitlist).set({ mirroredAt: started }).where(inArray(waitlist.email, plan.markMirrored));
  }
  // Unsubscribed at Resend after we'd mirrored them: they've left.
  if (plan.remove.length > 0) {
    const { leaveWaitlistByEmail } = await import("@/lib/waitlist");
    for (const email of plan.remove) await leaveWaitlistByEmail(email);
  }

  const changed = plan.create.length + plan.resubscribe.length + plan.addToSegment.length + plan.remove.length;
  if (changed > 0) {
    console.log(
      `[newsletter] synced: +${plan.create.length} new, ${plan.resubscribe.length} re-subscribed, ` +
        `${plan.addToSegment.length} into the segment, ${plan.remove.length} unsubscribed at Resend and taken off the waitlist`,
    );
  }
}

/** For one row just confirmed: mirror it now, and note it; the sync retries if this fails. */
export async function mirrorConfirmed(email: string): Promise<void> {
  try {
    await mirrorSubscribe(email);
    if (enabled()) await db.update(waitlist).set({ mirroredAt: new Date() }).where(eq(waitlist.email, email));
  } catch (err) {
    console.error(`[newsletter] couldn't mirror ${email} on confirm (the hourly sync will):`, err);
  }
}
