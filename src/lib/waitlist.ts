import "server-only";
import { randomBytes } from "node:crypto";
import { asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { signupSurveys, users, waitlist } from "@/db/schema";
import { idempotencyKey, sendEmail, sendEmailBatch } from "@/lib/email/resend-client";
import { accountExistsEmail, signupsOpenEmail, waitlistJoinedEmail } from "@/lib/email/templates";
import { issueInvite } from "@/lib/invitations";
import { appUrl } from "@/lib/site";
import { OTHER, asksBettingHabits, type SignupSurvey, type SurveySource } from "@/lib/signup-survey";

/**
 * The waitlist, and the sign-up that replaces it when SIGNUP_ENABLED is on.
 *
 * Both answer the form identically whatever the address is — new, already
 * waiting, or already an account — so the form can't be used to find out who
 * has an account. The difference shows only in the owner's inbox: an
 * existing account gets "you already have one" instead.
 */

/** RFC 8058 one-click unsubscribe, which Gmail and Yahoo want on list mail. */
function listHeaders(token: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${appUrl(`/api/waitlist/leave?token=${encodeURIComponent(token)}`)}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

function leaveUrl(token: string): string {
  return appUrl(`/waitlist/leave?token=${encodeURIComponent(token)}`);
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

/**
 * Puts an address on the waitlist and sends the one confirmation. Someone
 * already waiting gets nothing new — a form anyone can post must not become a
 * way to mail a stranger again and again.
 */
export async function joinWaitlist(
  email: string,
  source: "landing" | "signup",
  { mail = true }: { mail?: boolean } = {},
): Promise<void> {
  if (await hasAccount(email)) return mail ? sendAccountExists(email) : undefined;

  const token = randomBytes(24).toString("base64url");
  // Already waiting: the insert returns nothing, and nothing returned means no email.
  const [row] = await db
    .insert(waitlist)
    .values({ email, leaveToken: token, source })
    .onConflictDoNothing({ target: waitlist.email })
    .returning({ leaveToken: waitlist.leaveToken });
  if (!row || !mail) return;

  await sendEmail({
    to: email,
    ...waitlistJoinedEmail({ leaveUrl: leaveUrl(row.leaveToken) }),
    headers: listHeaders(row.leaveToken),
    idempotencyKey: idempotencyKey("waitlist", row.leaveToken.slice(0, 16)),
  });
}

/** Sign-ups open: email a link to the account form — or, for an existing account, say so. */
export async function startSignup(email: string): Promise<void> {
  if (await hasAccount(email)) return sendAccountExists(email);
  await issueInvite(email, null);
}

/** Off the list, and forgotten, by the token in their link. False if the link matches no one. */
export async function leaveWaitlist(token: string): Promise<boolean> {
  const [row] = await db
    .delete(waitlist)
    .where(eq(waitlist.leaveToken, token))
    .returning({ id: waitlist.id, email: waitlist.email });
  if (row) await db.delete(signupSurveys).where(eq(signupSurveys.email, row.email));
  return Boolean(row);
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

/** An account was made for this address: it's no longer waiting for anything. */
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
  /** Everyone waiting, and those not yet told sign-ups are open. */
  waiting: number;
  untold: number;
}> {
  const needle = q.trim().toLowerCase();
  const like = `%${needle.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const match = needle ? sql`lower(${waitlist.email}) like ${like}` : undefined;
  const [rows, [{ total }], [{ waiting, untold }]] = await Promise.all([
    db
      .select({
        id: waitlist.id,
        email: waitlist.email,
        source: waitlist.source,
        createdAt: waitlist.createdAt,
        invitedAt: waitlist.invitedAt,
        notifiedAt: waitlist.notifiedAt,
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
        waiting: sql<number>`count(*)::int`,
        untold: sql<number>`count(*) filter (where ${waitlist.notifiedAt} is null)::int`,
      })
      .from(waitlist),
  ]);
  return { rows, total, waiting, untold };
}

/** An admin let this person in: a normal invite, and the row remembers it. */
export async function inviteFromWaitlist(id: string, invitedBy: string): Promise<string | null> {
  const [row] = await db
    .select({ email: waitlist.email })
    .from(waitlist)
    .where(eq(waitlist.id, id))
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
  const rows = await db
    .select({ email: waitlist.email, leaveToken: waitlist.leaveToken })
    .from(waitlist)
    .where(isNull(waitlist.notifiedAt));
  if (rows.length === 0) return { sent: 0, failed: 0 };

  const signupUrl = appUrl("/signup");
  const { sent, failed } = await sendEmailBatch(
    rows.map((r) => ({
      to: r.email,
      ...signupsOpenEmail({ signupUrl, leaveUrl: leaveUrl(r.leaveToken) }),
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
