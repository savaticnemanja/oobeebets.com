/**
 * Password gate for the beta deployment.
 *
 * It lives in the branch rather than in the reverse proxy so the environment
 * carries its own gate: beta.oobeebets.com is built from this branch, and
 * nothing outside the repository has to be configured for the preview to stay
 * private. It also means the gate is reviewable, and that a wrong password
 * looks like the rest of the site instead of a browser dialog.
 *
 * BETA_GATE_PASSWORD alone decides whether any of this is active. Unset — the
 * case on main and in production — and every entry point here is inert, so the
 * branch stays safe to merge forward.
 *
 * Nothing in this file may reach for `node:crypto`: middleware runs on the
 * edge runtime, where only Web Crypto exists. Both runtimes have `crypto`
 * as a global, so both use it.
 */

export const BETA_GATE_COOKIE = "oobee_beta_gate";

/** Long enough that a reviewer is not re-prompted mid-review. */
export const BETA_GATE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/** The path that serves the prompt. Shared so middleware and page agree. */
export const BETA_GATE_PATH = "/beta-gate";

/**
 * The configured password, or null when the gate is switched off entirely.
 * Whitespace-only counts as off — an env file with `BETA_GATE_PASSWORD=` in it
 * should not lock everyone out of a site nobody meant to gate.
 */
export function betaGatePassword(): string | null {
  const raw = process.env.BETA_GATE_PASSWORD;
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const encoder = new TextEncoder();

/**
 * The signing key is derived from the password itself, which is what makes
 * rotating BETA_GATE_PASSWORD revoke every cookie already handed out. There is
 * no separate secret to keep in step with it.
 */
async function signingKey(password: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(`oobee-beta-gate-v1:${password}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

function toBase64Url(buffer: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(expiresAt: number, password: string): Promise<string> {
  const signature = await crypto.subtle.sign(
    "HMAC",
    await signingKey(password),
    encoder.encode(String(expiresAt)),
  );
  return toBase64Url(signature);
}

/**
 * Constant-time compare for two equal-length strings. Both callers below feed
 * it fixed-width values — a base64url HMAC and a hex digest — so the early
 * return on a length mismatch cannot leak anything about a secret.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) {
    difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return difference === 0;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Compares a submitted password against the configured one.
 *
 * Both sides are hashed first so the comparison runs over two 64-character
 * hex strings. Comparing the raw values instead would return early whenever
 * the lengths differed, which hands out the password's length one guess at a
 * time.
 */
export async function matchesBetaGatePassword(
  submitted: string,
  password: string,
): Promise<boolean> {
  const [a, b] = await Promise.all([sha256Hex(submitted), sha256Hex(password)]);
  return constantTimeEqual(a, b);
}

/** `<expiry>.<hmac>` — the expiry is in the clear and signed, not encrypted. */
export async function issueBetaGateToken(
  password: string,
  now: number = Date.now(),
): Promise<string> {
  const expiresAt = now + BETA_GATE_TTL_MS;
  return `${expiresAt}.${await sign(expiresAt, password)}`;
}

export async function verifyBetaGateToken(
  token: string,
  password: string,
  now: number = Date.now(),
): Promise<boolean> {
  const separator = token.indexOf(".");
  if (separator < 1) return false;

  const expiresAt = Number(token.slice(0, separator));
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) return false;

  return constantTimeEqual(token.slice(separator + 1), await sign(expiresAt, password));
}

/**
 * Keeps a `next` value from turning the gate into an open redirect. A leading
 * `//` or `/\` is a protocol-relative URL and leaves the site, so only a single
 * leading slash is allowed through.
 */
export function safeNextPath(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//") || value.startsWith("/\\")) return null;
  return value;
}
