import "server-only";
import { resendClient } from "@/lib/email/resend-client";
import { leaveImportedByEmail, leaveWaitlistByEmail } from "@/lib/waitlist";

/**
 * What's left of the launch list: unsubscribing from it.
 *
 * Until 18 Oct 2026 the homepage box added addresses to a Resend contact book
 * and mailed them a welcome. That list was merged into the waitlist (the 28
 * contacts that weren't bot sign-ups were imported as confirmed, source
 * "launch-list"), and the homepage box now joins the waitlist with a
 * confirmation email (lib/waitlist.ts). The emails already sent still carry
 * unsubscribe links into Resend — /api/unsubscribe and the /unsubscribe page —
 * so these keep working, and now take the address off the waitlist as well.
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
  // The id is only in mail we sent to that address, so it stands for the
  // address: whatever list it's on now, it comes off.
  const { data: contact, error: lookup } = await resendClient().contacts.get({ id: contactId });
  if (lookup) {
    if (lookup.name === "not_found") return false;
    if (lookup.name === "validation_error") throw new InvalidUnsubscribeLink();
    throw new Error(`Resend contacts.get failed: ${lookup.name} — ${lookup.message}`);
  }

  const { error } = await resendClient().contacts.update({
    id: contactId,
    unsubscribed: true,
  });

  if (error) {
    if (error.name === "not_found") return false;
    if (error.name === "validation_error") throw new InvalidUnsubscribeLink();
    throw new Error(`Resend contacts.update failed: ${error.name} — ${error.message}`);
  }

  if (contact?.email) await leaveWaitlistByEmail(contact.email.toLowerCase());
  return true;
}

/**
 * Opts out by typed address, for someone who no longer has the email.
 *
 * No confirmation step on purpose. The alternative — mailing a link to
 * somebody who has just told us they want less mail — is worse for the person
 * we would be protecting. Since anyone can type any address here, it only
 * reaches what that address got from the old launch list: the Resend contact,
 * and its imported waitlist row (source "launch-list"). Anyone who joined the
 * waitlist since leaves with the link in their own email, which proves the
 * address is theirs — so a griefer can't knock strangers off the waitlist.
 */
export async function unsubscribeByEmail(email: string): Promise<boolean> {
  const { error } = await resendClient().contacts.update({
    email,
    unsubscribed: true,
  });

  if (error && error.name !== "not_found") {
    throw new Error(`Resend contacts.update failed: ${error.name} — ${error.message}`);
  }

  const imported = await leaveImportedByEmail(email);
  return !error || imported;
}
