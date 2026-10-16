/**
 * Whether anyone can make an account, or only people an admin invites.
 *
 * SIGNUP_ENABLED=1 opens it: the landing form and /signup email a link that
 * leads to the same account form an invite does, so every account still
 * starts from an address that's been proven to be theirs. Unset, both forms
 * put people on the waitlist instead (lib/waitlist.ts).
 *
 * Read at run time, so flipping it needs a restart, not a rebuild — and
 * anything that reads it has to render per request.
 */
export function signupEnabled(): boolean {
  return process.env.SIGNUP_ENABLED?.trim() === "1";
}
