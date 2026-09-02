"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { clientIp, rateLimit } from "@/lib/auth";
import {
  BETA_GATE_COOKIE,
  BETA_GATE_TTL_MS,
  betaGatePassword,
  issueBetaGateToken,
  matchesBetaGatePassword,
  safeNextPath,
} from "@/lib/beta-gate";
import type { ActionState } from "@/lib/validation";

/**
 * One password, shared by everyone reviewing the beta. There is no account
 * behind it and nothing to enumerate, so — unlike the login form — this can
 * say plainly that the password was wrong.
 */
const WRONG_PASSWORD = "That password is not right";

const ATTEMPT_LIMIT = 20;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

export async function unlockBetaAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const password = betaGatePassword();
  // The gate is off, so the page that submitted this should not exist. Nothing
  // to unlock; put them on the site.
  if (!password) redirect("/");

  const requestHeaders = await headers();
  if (!(await rateLimit("beta-gate", clientIp(requestHeaders), ATTEMPT_LIMIT, ATTEMPT_WINDOW_MS))) {
    return { ok: false, error: "Too many attempts from this network. Try again shortly." };
  }

  const submitted = formData.get("password");
  if (typeof submitted !== "string" || submitted.length === 0) {
    return { ok: false, error: "Enter the password", fieldErrors: { password: ["Enter the password"] } };
  }

  if (!(await matchesBetaGatePassword(submitted, password))) {
    return { ok: false, error: WRONG_PASSWORD };
  }

  const jar = await cookies();
  jar.set(BETA_GATE_COOKIE, await issueBetaGateToken(password), {
    httpOnly: true,
    // Beta is served over TLS, but a plain `npm run dev` against this branch is
    // not; a Secure cookie there would never come back and the gate would
    // reject its own password forever.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: BETA_GATE_TTL_MS / 1000,
  });

  const next = formData.get("next");
  redirect(safeNextPath(typeof next === "string" ? next : null) ?? "/");
}
