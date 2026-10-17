/**
 * What the newsletter sync (lib/newsletter.ts syncNewsletter) should change,
 * worked out from both sides without touching either — pure, so
 * scripts/verify.mjs can check every case.
 *
 * The waitlist is the list; Resend's "Waitlist" segment mirrors its confirmed
 * rows so newsletters sent from Resend reach exactly them. Unsubscribing at
 * Resend (the link in a broadcast) is the one change that flows the other way.
 */

export interface PlanRow {
  email: string;
  /** When we last subscribed it in Resend; null = never, or not since it (re)joined. */
  mirroredAt: Date | null;
}

export interface PlanContact {
  email: string;
  unsubscribed: boolean;
}

export interface NewsletterPlan {
  /** No contact yet: create it, subscribed, in the segment. */
  create: string[];
  /** A contact that reads unsubscribed, for a row confirmed since: subscribe it again. */
  resubscribe: string[];
  /** Subscribed but outside the segment: add it. */
  addToSegment: string[];
  /** Already right at Resend; only the row needs mirroredAt. */
  markMirrored: string[];
  /** Mirrored, then unsubscribed at Resend: they left — off the waitlist. */
  remove: string[];
}

export function planNewsletterSync(
  rows: PlanRow[],
  contacts: PlanContact[],
  segmentEmails: Set<string>,
): NewsletterPlan {
  const byEmail = new Map(contacts.map((c) => [c.email.toLowerCase(), c]));
  const plan: NewsletterPlan = { create: [], resubscribe: [], addToSegment: [], markMirrored: [], remove: [] };
  for (const row of rows) {
    const email = row.email.toLowerCase();
    const contact = byEmail.get(email);
    if (!contact) plan.create.push(email);
    else if (contact.unsubscribed) (row.mirroredAt ? plan.remove : plan.resubscribe).push(email);
    else if (!segmentEmails.has(email)) plan.addToSegment.push(email);
    else if (!row.mirroredAt) plan.markMirrored.push(email);
  }
  return plan;
}
