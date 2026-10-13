"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { clientIp, createSession, destroySession, fakeVerify, rateLimit, verifyPassword } from "@/lib/auth";
import { loginSchema, fieldErrorsFrom, type ActionState } from "@/lib/validation";
import { safeNextPath } from "@/lib/beta-gate";

const LOGIN_LIMIT = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
/** Every address, known or not, across all IPs — the backstop against a spread-out guesser. */
const ACCOUNT_LIMIT = 50;
const ACCOUNT_WINDOW_MS = 60 * 60 * 1000;

/** Deliberately vague — never reveals whether an email is registered. */
const BAD_CREDENTIALS = "Email or password is incorrect";

export async function loginAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { ok: false, error: "Check the fields below", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const { email, password } = parsed.data;
  const ip = clientIp(await headers());

  // Throttled, never locked. The old lock was keyed on the email alone, so
  // anyone who knew an address could keep its owner out for good by getting
  // its password wrong ten times every fifteen minutes. Now the tight limit
  // is per email *and* IP — a guesser burns only their own attempts — with a
  // per-IP cap against spraying many accounts, and a looser per-address cap
  // across all IPs against guessing one account from many. Every limit counts
  // unknown addresses exactly like real ones, so being throttled says nothing
  // about whether an account exists.
  const pairOk = await rateLimit("login:email-ip", `${email} ${ip}`, LOGIN_LIMIT, LOGIN_WINDOW_MS);
  const ipOk = await rateLimit("login:ip", ip, LOGIN_LIMIT * 5, LOGIN_WINDOW_MS);
  const accountOk = await rateLimit("login:account", email, ACCOUNT_LIMIT, ACCOUNT_WINDOW_MS);
  if (!pairOk || !ipOk || !accountOk) {
    return { ok: false, error: "Too many attempts. Wait a while, or reset your password." };
  }

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (!user) {
    await fakeVerify(password); // equalise timing against a real verify
    return { ok: false, error: BAD_CREDENTIALS };
  }

  if (!(await verifyPassword(password, user.passwordHash))) {
    return { ok: false, error: BAD_CREDENTIALS };
  }

  await db
    .update(users)
    .set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() })
    .where(eq(users.id, user.id));

  await createSession(user.id);
  // Back to wherever sent them to sign in — the form has always carried
  // ?next=, but this used to drop it on the floor — else to the feed.
  redirect(safeNextPath(formData.get("next")?.toString()) ?? "/home");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/");
}
