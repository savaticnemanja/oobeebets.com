import "server-only";
import { resendClient, sendEmail } from "@/lib/email";
import { welcomeEmail } from "@/lib/email/templates";

/**
 * The mailing list.
 *
 * Resend's contact book is the list — there is no local mirror of it. That is
 * deliberate: a copy in Postgres and a copy at Resend drift the moment either
 * one is edited by hand, and the copy people actually get mailed from is the
 * one that wins. Keeping a single store removes the question.
 *
 * What that costs, and it is worth knowing:
 *
 *  - Resend is now on the critical path for signing up, not just for the
 *    welcome email. Their outage is our signup outage, and there is no local
 *    queue to drain afterwards.
 *  - Every signup is two or three API calls against an account-wide rate
 *    limit. Fine for a pre-launch list; revisit before a campaign that adds
 *    thousands of addresses at once.
 *  - `unsubscribed` on the contact is the opt-out record. Resend keeps the
 *    contact rather than deleting it, which is the suppression list our
 *    privacy policy describes.
 *
 * `RESEND_SEGMENT_ID` is optional. Set it and new contacts join that segment,
 * which is how you keep the pre-launch list separable from later ones; leave
 * it unset and contacts land in the account-wide book.
 */

const segmentId = process.env.RESEND_SEGMENT_ID;

/** Shape we care about, narrowed from the contact Resend returns. */
interface Contact {
  id: string;
  unsubscribed: boolean;
}

/**
 * Resend reports failures in the response rather than throwing, and a missing
 * contact is reported the same way. Callers need those two apart: "no such
 * address" is a normal branch, anything else has to surface as an error so the
 * action can tell the visitor to retry instead of silently losing them.
 */
async function findContact(email: string): Promise<Contact | null> {
  const { data, error } = await resendClient().contacts.get({ email });

  if (error) {
    if (error.name === "not_found") return null;
    throw new Error(`Resend contacts.get failed: ${error.name} — ${error.message}`);
  }

  return data ? { id: data.id, unsubscribed: data.unsubscribed } : null;
}

export type SubscribeOutcome =
  /** New address, or one returning after unsubscribing. Welcome mail sent. */
  | "subscribed"
  /** Already on the list and still subscribed. Nothing sent, nothing changed. */
  | "already";

export interface SubscribeOptions {
  /**
   * The pre-launch welcome. Off for the seat waitlist on the pricing page,
   * which is the same list but a different promise — mailing someone "welcome
   * to the pre-launch list" when they asked to be told about a free seat is
   * the wrong message.
   */
  welcome?: boolean;
}

/**
 * Adds an address to the list, or reinstates one that had opted out.
 *
 * Deliberately does not send a second welcome to an address that is already
 * subscribed: without that check, a form anyone can POST becomes a way to mail
 * a stranger's inbox on demand.
 */
export async function subscribe(
  email: string,
  { welcome = true }: SubscribeOptions = {},
): Promise<SubscribeOutcome> {
  const existing = await findContact(email);

  if (existing && !existing.unsubscribed) return "already";

  let contactId: string;

  if (existing) {
    // Coming back after opting out. Note the id does not change, so an
    // unsubscribe link from before still works — unlike the rotating token
    // this replaced. That is the better behaviour: a link in an old message
    // that says "unsubscribe" should keep doing what it says.
    const { error } = await resendClient().contacts.update({
      email,
      unsubscribed: false,
    });

    if (error) {
      throw new Error(
        `Resend contacts.update failed: ${error.name} — ${error.message}`,
      );
    }

    contactId = existing.id;
  } else {
    // Verified against the live API: creating an address that already exists
    // is not an error. Resend returns the existing contact's id, so create is
    // idempotent by email and there is no conflict branch to write.
    //
    // The consequence is that the `findContact` above is the only thing
    // stopping a second welcome going out, and it is a read, not a lock. Two
    // submissions of the same new address genuinely in flight together will
    // both see nothing, both create, and both send — the old table could rule
    // that out with a unique index and `onConflictDoNothing`, and this cannot.
    // What bounds it is the disabled submit button and the five-per-quarter-hour
    // limiter in the action; the failure is a duplicate welcome, not a
    // duplicate subscriber.
    const { data, error } = await resendClient().contacts.create({
      email,
      unsubscribed: false,
      ...(segmentId ? { segments: [{ id: segmentId }] } : {}),
    });

    if (error) {
      throw new Error(
        `Resend contacts.create failed: ${error.name} — ${error.message}`,
      );
    }

    contactId = data.id;
  }

  if (welcome) await sendEmail({ to: email, ...welcomeEmail(contactId) });

  return "subscribed";
}

/**
 * Thrown when the identifier in an unsubscribe link is not even the right
 * shape — a truncated or hand-edited URL, rather than one that simply matches
 * nobody. Kept apart because the two need opposite handling: see below.
 */
export class InvalidUnsubscribeLink extends Error {
  constructor() {
    super("The unsubscribe link is malformed");
    this.name = "InvalidUnsubscribeLink";
  }
}

/**
 * Opts an address out by the contact id carried in its unsubscribe link.
 * Returns false only when the id matches nothing — an already-unsubscribed
 * contact still reports success, because from the subscriber's side the
 * outcome they asked for is the outcome they have.
 *
 * The two failure modes are deliberately not merged, because Resend
 * distinguishes them and so must we (verified against the live API):
 *
 *  - A well-formed id that matches nobody comes back `not_found`. That is
 *    swallowed into a success, or the page becomes a way to test whether a
 *    given contact exists.
 *  - A malformed id comes back `validation_error`. Reporting success there
 *    would tell someone with a truncated link that they are unsubscribed when
 *    nothing happened, and they would keep getting mail. It carries no
 *    membership information either, since it cannot be anyone's id — so it is
 *    safe, and honest, to say the link is broken.
 */
export async function unsubscribeById(contactId: string): Promise<boolean> {
  const { error } = await resendClient().contacts.update({
    id: contactId,
    unsubscribed: true,
  });

  if (error) {
    if (error.name === "not_found") return false;
    if (error.name === "validation_error") throw new InvalidUnsubscribeLink();
    throw new Error(`Resend contacts.update failed: ${error.name} — ${error.message}`);
  }

  return true;
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
  const { error } = await resendClient().contacts.update({
    email,
    unsubscribed: true,
  });

  if (error) {
    if (error.name === "not_found") return false;
    throw new Error(`Resend contacts.update failed: ${error.name} — ${error.message}`);
  }

  return true;
}
