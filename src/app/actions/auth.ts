"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { clientIp, createSession, destroySession, fakeVerify, rateLimit, verifyPassword } from "@/lib/auth";
import { loginSchema, fieldErrorsFrom, type ActionState } from "@/lib/validation";

const LOGIN_LIMIT = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

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
  const h = await headers();

  // Limit per-email and per-IP: one stops targeting an account, the other
  // stops spraying many accounts from one host.
  const emailOk = await rateLimit("login:email", email, LOGIN_LIMIT, LOGIN_WINDOW_MS);
  const ipOk = await rateLimit("login:ip", clientIp(h), LOGIN_LIMIT * 5, LOGIN_WINDOW_MS);
  if (!emailOk || !ipOk) {
    return { ok: false, error: "Too many attempts. Try again in 15 minutes." };
  }

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (!user) {
    await fakeVerify(password); // equalise timing against a real verify
    return { ok: false, error: BAD_CREDENTIALS };
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { ok: false, error: "Account temporarily locked. Try again shortly." };
  }

  const valid = await verifyPassword(password, user.passwordHash);

  if (!valid) {
    await db
      .update(users)
      .set({
        failedLoginCount: sql`${users.failedLoginCount} + 1`,
        lockedUntil: sql`case when ${users.failedLoginCount} + 1 >= ${LOGIN_LIMIT}
          then now() + interval '15 minutes' else null end`,
      })
      .where(eq(users.id, user.id));
    return { ok: false, error: BAD_CREDENTIALS };
  }

  await db
    .update(users)
    .set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() })
    .where(eq(users.id, user.id));

  await createSession(user.id);
  redirect(user.role === "user" ? "/picks" : "/admin");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/");
}
