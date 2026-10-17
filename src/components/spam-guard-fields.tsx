import { HONEYPOT_FIELD, TOKEN_FIELD } from "@/lib/form-token";

/**
 * The two hidden inputs every public email form carries (see lib/spam-guard.ts):
 * the signed render time, and a decoy field a person never sees or tabs to.
 * The decoy is moved off-screen rather than display:none, which some bots
 * skip, and hidden from screen readers so nobody is asked to "leave it empty".
 */
export function SpamGuardFields({ token }: { token: string }) {
  return (
    <>
      <input type="hidden" name={TOKEN_FIELD} value={token} />
      <div aria-hidden="true" className="pointer-events-none absolute -left-[10000px] top-auto h-px w-px overflow-hidden">
        <label>
          Website
          <input type="text" name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>
    </>
  );
}
