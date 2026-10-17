import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The pieces of the sign-up forms' bot checks that hold no secret of their own
 * — field names and the token's arithmetic — so the forms, the server guard
 * (lib/spam-guard.ts) and scripts/verify.mjs can all share them.
 *
 * A form token is the moment the page was rendered, signed: `<base36 ms>.<mac>`.
 * Posted back, it says how long the visitor took. A person needs seconds to
 * type an email (minutes for the application); a script posts in milliseconds.
 */

/** The decoy field. Visually hidden and out of the tab order: only a bot fills it. */
export const HONEYPOT_FIELD = "website";
export const TOKEN_FIELD = "form_token";

function mac(secret: string, ts: string): string {
  return createHmac("sha256", secret).update(`form:${ts}`).digest("base64url").slice(0, 22);
}

export function signFormToken(secret: string, issuedAtMs: number): string {
  const ts = issuedAtMs.toString(36);
  return `${ts}.${mac(secret, ts)}`;
}

export type TokenVerdict = "ok" | "too-fast" | "stale" | "invalid";

/** Was this token signed by us, and was it issued at least `minMs` and at most `maxMs` ago? */
export function checkFormToken(
  secret: string,
  token: unknown,
  nowMs: number,
  { minMs, maxMs }: { minMs: number; maxMs: number },
): TokenVerdict {
  if (typeof token !== "string" || token.length > 64) return "invalid";
  const [ts, sig] = token.split(".");
  if (!ts || !sig) return "invalid";
  const want = Buffer.from(mac(secret, ts));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return "invalid";
  const issued = parseInt(ts, 36);
  if (!Number.isFinite(issued)) return "invalid";
  const age = nowMs - issued;
  if (age < minMs) return "too-fast";
  if (age > maxMs) return "stale";
  return "ok";
}
