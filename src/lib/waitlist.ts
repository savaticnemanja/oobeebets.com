import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, eq, gt, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { signupSurveys, users, waitlist } from "@/db/schema";
import { idempotencyKey, sendEmail, sendEmailBatch } from "@/lib/email/resend-client";
import { accountExistsEmail, signupsOpenEmail, unsubscribeLinkEmail, waitlistConfirmEmail } from "@/lib/email/templates";
import { contactEmail, contactIdFor, mirrorConfirmed, mirrorUnsubscribe, syncNewsletter } from "@/lib/newsletter";
import { hashToken } from "@/lib/auth";
import { issueInvite } from "@/lib/invitations";
import { appUrl } from "@/lib/site";
import { OTHER, asksBettingHabits, type SignupSurvey, type SurveySource } from "@/lib/signup-survey";

/**
 * The waitlist — the one list. Both public forms join it (the homepage box and
 * the /signup application; actions/waitlist.ts screens them first), an address
 * counts only once confirmed, confirmed addresses are mirrored into Resend's
 * "Waitlist" segment for newsletters (lib/newsletter.ts), and unsubscribing
 * anywhere takes the address off both.
 *
 * Every reply to a form is the same whatever the address is — new, already
 * waiting, or already an account — so a form can't be used to find out who's
 * on the list or has an account. The difference shows only in that inbox.
 */

/** RFC 8058 one-click unsubscribe, which Gmail and Yahoo want on list mail. */
function listHeaders(token: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${appUrl(`/api/unsubscribe?token=${encodeURIComponent(token)}`)}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

/** The page every unsubscribe link opens — a leave token or, from the old launch list, a Resend contact id. */
function unsubscribeUrl(token: string): string {
  return appUrl(`/unsubscribe?token=${encodeURIComponent(token)}`);
}

async function hasAccount(email: string): Promise<boolean> {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  return Boolean(row);
}

/** "You already have an account" — at most once a day per address, so the form can't flood an inbox. */
async function sendAccountExists(email: string): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);
  await sendEmail({
    to: email,
    ...accountExistsEmail({ loginUrl: appUrl("/login"), resetUrl: appUrl("/forgot-password") }),
    idempotencyKey: idempotencyKey("account-exists", email, day),
  });
}

/** A confirmation link works this long; an unconfirmed row is swept after it. */
export const CONFIRM_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const RESEND_CONFIRM_AFTER_MS = 24 * 60 * 60 * 1000;

function confirmUrl(token: string): string {
  return appUrl(`/waitlist/confirm?token=${encodeURIComponent(token)}`);
}

/**
 * Puts an address on the waitlist — unconfirmed — and emails it a link to
 * confirm (double opt-in). Only a click on that link puts it on the list for
 * real; see the confirmedAt note in db/schema.ts.
 *
 * Every case answers the form the same way, and each address gets at most one
 * confirmation a day however often it's typed in: a confirmed address hears
 * nothing more, an unconfirmed one gets a fresh link once 24 hours have passed,
 * and an address with an account is told so (once a day) instead.
 *
 * `mail: false` (the site-wide hour's budget is spent) records the row and
 * sends nothing; its next submission after the budget recovers sends the link.
 */
export async function joinWaitlist(
  email: string,
  source: "landing" | "signup",
  { mail = true }: { mail?: boolean } = {},
): Promise<void> {
  if (await hasAccount(email)) return mail ? sendAccountExists(email) : undefined;

  const token = randomBytes(24).toString("base64url");
  const fresh = {
    confirmTokenHash: mail ? hashToken(token) : null,
    confirmSentAt: mail ? new Date() : null,
  };
  const [inserted] = await db
    .insert(waitlist)
    .values({ email, leaveToken: randomBytes(24).toString("base64url"), source, ...fresh })
    .onConflictDoNothing({ target: waitlist.email })
    .returning({ leaveToken: waitlist.leaveToken });

  let leaveToken = inserted?.leaveToken;
  if (!inserted) {
    // Already there: unconfirmed and not mailed in the last day gets a new link.
    const [row] = await db
      .update(waitlist)
      .set(fresh)
      .where(
        and(
          eq(waitlist.email, email),
          isNull(waitlist.confirmedAt),
          or(isNull(waitlist.confirmSentAt), lt(waitlist.confirmSentAt, new Date(Date.now() - RESEND_CONFIRM_AFTER_MS))),
        ),
      )
      .returning({ leaveToken: waitlist.leaveToken });
    leaveToken = row?.leaveToken;
  }
  if (!leaveToken || !mail) return;

  const [answered] = await db.select({ id: signupSurveys.id }).from(signupSurveys).where(eq(signupSurveys.email, email)).limit(1);
  await sendEmail({
    to: email,
    ...waitlistConfirmEmail({ confirmUrl: confirmUrl(token), leaveUrl: unsubscribeUrl(leaveToken), answered: Boolean(answered) }),
    headers: listHeaders(leaveToken),
    idempotencyKey: idempotencyKey("waitlist-confirm", hashToken(token).slice(0, 16)),
  });
}

/**
 * The confirmation link, clicked (and its page's button pressed — a GET alone
 * never confirms, so a mail scanner opening every link can't sign anyone up).
 * Returns the address and whether it has answered the application, or null
 * for a used, expired or unknown link.
 */
export async function confirmWaitlist(token: string): Promise<{ email: string; answered: boolean } | null> {
  const [row] = await db
    .update(waitlist)
    .set({ confirmedAt: new Date(), confirmTokenHash: null })
    .where(
      and(
        eq(waitlist.confirmTokenHash, hashToken(token)),
        isNull(waitlist.confirmedAt),
        gt(waitlist.confirmSentAt, new Date(Date.now() - CONFIRM_WINDOW_MS)),
      ),
    )
    .returning({ email: waitlist.email });
  if (!row) return null;
  // On the list now — so in the newsletter too (retried hourly if Resend fails).
  await mirrorConfirmed(row.email);
  const [answered] = await db.select({ id: signupSurveys.id }).from(signupSurveys).where(eq(signupSurveys.email, row.email)).limit(1);
  return { email: row.email, answered: Boolean(answered) };
}

/**
 * The daily sweep's part (lib/housekeeping.ts): addresses that never
 * confirmed within the window are forgotten, with any application answers —
 * unless an account has since been made for the address.
 */
export async function purgeUnconfirmed(): Promise<number> {
  const gone = await db
    .delete(waitlist)
    .where(and(isNull(waitlist.confirmedAt), lt(waitlist.createdAt, new Date(Date.now() - CONFIRM_WINDOW_MS))))
    .returning({ email: waitlist.email });
  if (gone.length > 0) {
    await db.execute(sql`
      delete from ${signupSurveys} s
      where s.email in (${sql.join(gone.map((g) => sql`${g.email}`), sql`, `)})
        and not exists (select 1 from ${users} u where u.email = s.email)`);
  }
  return gone.length;
}

/** Sign-ups open: email a link to the account form — or, for an existing account, say so. */
export async function startSignup(email: string): Promise<void> {
  if (await hasAccount(email)) return sendAccountExists(email);
  await issueInvite(email, null);
}

const CONTACT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Every unsubscribe link we've ever sent, resolved to its address and acted
 * on: unsubscribed at Resend first (so a failure there is retried, never left
 * half done), then off the waitlist with its answers. A leave token is in the
 * waitlist's own emails; a Resend contact id is in the old launch-list emails.
 * False if the token matches no one; a malformed contact id throws
 * InvalidUnsubscribeLink.
 */
export async function unsubscribeByToken(token: string): Promise<boolean> {
  let email: string | null;
  if (CONTACT_ID.test(token)) {
    email = await contactEmail(token);
  } else {
    const [row] = await db.select({ email: waitlist.email }).from(waitlist).where(eq(waitlist.leaveToken, token)).limit(1);
    email = row?.email ?? null;
  }
  if (!email) return false;
  await mirrorUnsubscribe(email);
  await leaveWaitlistByEmail(email);
  return true;
}

/**
 * Someone on /unsubscribe without their email: mail the address its own link
 * (at most once a day). Typing an address never unsubscribes it directly —
 * that would let anyone knock a stranger off the waitlist.
 */
export async function requestUnsubscribeLink(email: string): Promise<void> {
  const [row] = await db.select({ leaveToken: waitlist.leaveToken }).from(waitlist).where(eq(waitlist.email, email)).limit(1);
  const token = row?.leaveToken ?? (await contactIdFor(email));
  if (!token) return;
  const day = new Date().toISOString().slice(0, 10);
  await sendEmail({
    to: email,
    ...unsubscribeLinkEmail({ unsubscribeUrl: unsubscribeUrl(token) }),
    idempotencyKey: idempotencyKey("unsubscribe-link", email, day),
  });
}

/**
 * Stores the application's answers, replacing any earlier ones for the address.
 *
 * `unlessAccount` is for /signup, where nobody has proven they own the
 * address: anyone can type someone else's email there, so an address that
 * already has an account keeps the answers it gave (the invite wizard, which
 * is signed by its link, saves without it).
 */
export async function saveSignupSurvey(
  v: SignupSurvey,
  source: SurveySource,
  { unlessAccount = false }: { unlessAccount?: boolean } = {},
): Promise<void> {
  if (unlessAccount && (await hasAccount(v.email))) return;
  // Never bets: the habit questions weren't asked, so nothing is kept for them.
  const habits = asksBettingHabits(v.betFrequency);
  const sportsbooks = habits ? v.sportsbooks : [];
  const decisionTools = habits ? v.decisionTools : [];
  const values = {
    email: v.email,
    fullName: v.fullName,
    is21: v.is21 === "yes",
    betFrequency: v.betFrequency,
    experience: v.experience,
    sports: v.sports,
    sportsOther: v.sports.includes(OTHER) ? v.sportsOther : null,
    sportsbooks,
    sportsbookOther: sportsbooks.includes(OTHER) ? v.sportsbooksOther : null,
    betSize: habits ? v.betSize : null,
    decisionTools,
    decisionToolsOther: decisionTools.includes(OTHER) ? v.decisionToolsOther : null,
    wants: v.wants,
    willGiveFeedback: v.willGiveFeedback === "yes",
    willDoSurvey: v.willDoSurvey === "yes",
    source,
  };
  const { email: _email, ...update } = values;
  await db
    .insert(signupSurveys)
    .values(values)
    .onConflictDoUpdate({ target: signupSurveys.email, set: { ...update, updatedAt: new Date() } });
}

/** Whether this address has answered the application (on /signup, or an earlier invite). */
export async function hasSignupSurvey(email: string): Promise<boolean> {
  const [row] = await db.select({ id: signupSurveys.id }).from(signupSurveys).where(eq(signupSurveys.email, email)).limit(1);
  return Boolean(row);
}

/** One address's answers, if it ever gave any. */
export async function getSignupSurvey(email: string): Promise<SignupSurveyRow | null> {
  const [row] = await db.select().from(signupSurveys).where(eq(signupSurveys.email, email)).limit(1);
  return row ?? null;
}

export type SignupSurveyRow = typeof signupSurveys.$inferSelect;

/**
 * Off the waitlist by address, forgetting the answers too unless the address
 * has an account. Resend is the caller's to update: unsubscribeByToken does
 * it first, and syncNewsletter calls this for people who already
 * unsubscribed there.
 */
export async function leaveWaitlistByEmail(email: string): Promise<boolean> {
  const [row] = await db.delete(waitlist).where(eq(waitlist.email, email)).returning({ id: waitlist.id });
  if (!(await hasAccount(email))) await db.delete(signupSurveys).where(eq(signupSurveys.email, email));
  return Boolean(row);
}

/**
 * An account was made for this address: it's no longer waiting for anything.
 * Its Resend contact stays subscribed — they asked for the news, and making
 * an account doesn't change that (a broadcast's own link unsubscribes them).
 */
export async function removeFromWaitlist(email: string): Promise<void> {
  await db.delete(waitlist).where(eq(waitlist.email, email));
}

export interface WaitlistEntry {
  id: string;
  email: string;
  source: string;
  createdAt: Date;
  invitedAt: Date | null;
  notifiedAt: Date | null;
  confirmedAt: Date | null;
  survey: SignupSurveyRow | null;
}

/** One page of the people waiting, oldest first — the order they'd be let in. */
export async function getWaitlistPage({
  q = "",
  page = 1,
  size = 50,
}: { q?: string; page?: number; size?: number } = {}): Promise<{
  rows: WaitlistEntry[];
  /** Matching the search. */
  total: number;
  /** Everyone confirmed and waiting, those of them not yet told sign-ups are open, and those yet to confirm. */
  waiting: number;
  untold: number;
  unconfirmed: number;
}> {
  const needle = q.trim().toLowerCase();
  const like = `%${needle.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const match = needle ? sql`lower(${waitlist.email}) like ${like}` : undefined;
  const [rows, [{ total }], [{ waiting, untold, unconfirmed }]] = await Promise.all([
    db
      .select({
        id: waitlist.id,
        email: waitlist.email,
        source: waitlist.source,
        createdAt: waitlist.createdAt,
        invitedAt: waitlist.invitedAt,
        notifiedAt: waitlist.notifiedAt,
        confirmedAt: waitlist.confirmedAt,
        survey: signupSurveys,
      })
      .from(waitlist)
      .leftJoin(signupSurveys, eq(signupSurveys.email, waitlist.email))
      .where(match)
      .orderBy(asc(waitlist.createdAt))
      .limit(size)
      .offset((Math.max(1, page) - 1) * size),
    db.select({ total: sql<number>`count(*)::int` }).from(waitlist).where(match),
    db
      .select({
        waiting: sql<number>`count(*) filter (where ${waitlist.confirmedAt} is not null)::int`,
        untold: sql<number>`count(*) filter (where ${waitlist.confirmedAt} is not null and ${waitlist.notifiedAt} is null)::int`,
        unconfirmed: sql<number>`count(*) filter (where ${waitlist.confirmedAt} is null)::int`,
      })
      .from(waitlist),
  ]);
  return { rows, total, waiting, untold, unconfirmed };
}

/** An admin let this person in: a normal invite, and the row remembers it. */
export async function inviteFromWaitlist(id: string, invitedBy: string): Promise<string | null> {
  // Confirmed only: an unconfirmed address may be someone a bot typed in.
  const [row] = await db
    .select({ email: waitlist.email })
    .from(waitlist)
    .where(and(eq(waitlist.id, id), isNotNull(waitlist.confirmedAt)))
    .limit(1);
  if (!row) return null;
  await issueInvite(row.email, invitedBy);
  await db.update(waitlist).set({ invitedAt: new Date() }).where(eq(waitlist.id, id));
  return row.email;
}

/**
 * Tells everyone still waiting, and not yet told, that sign-ups are open.
 * Each message carries that reader's own leave link; only the ones Resend
 * accepted are marked, so running it again picks up any that failed.
 */
export async function notifyWaitlist(): Promise<{ sent: number; failed: number }> {
  // Anyone who unsubscribed at Resend since the last hourly sync comes off first.
  await syncNewsletter({ force: true }).catch((err) => console.error("[newsletter] sync before notify failed:", err));
  const rows = await db
    .select({ email: waitlist.email, leaveToken: waitlist.leaveToken })
    .from(waitlist)
    .where(and(isNull(waitlist.notifiedAt), isNotNull(waitlist.confirmedAt)));
  if (rows.length === 0) return { sent: 0, failed: 0 };

  const signupUrl = appUrl("/signup");
  const { sent, failed } = await sendEmailBatch(
    rows.map((r) => ({
      to: r.email,
      ...signupsOpenEmail({ signupUrl, leaveUrl: unsubscribeUrl(r.leaveToken) }),
      headers: listHeaders(r.leaveToken),
    })),
  );
  for (let i = 0; i < sent.length; i += 500) {
    await db
      .update(waitlist)
      .set({ notifiedAt: new Date() })
      .where(inArray(waitlist.email, sent.slice(i, i + 500)));
  }
  return { sent: sent.length, failed: failed.length };
}
