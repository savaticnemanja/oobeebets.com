import "server-only";
import { Resend } from "resend";

/**
 * Resend, created once and only if a key exists.
 *
 * There is deliberately no throw when the key is missing. Sending is always
 * best-effort here: the subscriber row is the thing that matters, and a local
 * dev box or a Resend outage must not be able to turn a successful signup into
 * an error page. Callers get told what happened and decide.
 */
const apiKey = process.env.RESEND_API_KEY;

let client: Resend | null = null;

function resend(): Resend | null {
  if (!apiKey) return null;
  client ??= new Resend(apiKey);
  return client;
}

/** `oobee bets <hello@oobeebets.com>` — must be a domain verified in Resend. */
const from = process.env.EMAIL_FROM ?? "oobee bets <onboarding@resend.dev>";

export interface SendResult {
  ok: boolean;
  /** True when no API key is configured, so nothing was attempted. */
  skipped: boolean;
  error?: string;
}

export interface SendArgs {
  to: string;
  subject: string;
  html: string;
  /**
   * Plain-text alternative. Not optional: a multipart message scores better
   * with spam filters than an HTML-only one, and it is the only thing a screen
   * reader in a text-mode client has to work with.
   */
  text: string;
  /**
   * RFC 8058 one-click unsubscribe, among others. Gmail and Yahoo require a
   * working List-Unsubscribe on bulk mail, and it is what puts the native
   * "Unsubscribe" control next to the sender name.
   */
  headers?: Record<string, string>;
}

export async function sendEmail(args: SendArgs): Promise<SendResult> {
  const mailer = resend();

  if (!mailer) {
    // Loud in dev, because a silently unsent welcome email looks exactly like
    // a working one from the browser.
    console.warn(
      `[email] RESEND_API_KEY not set — skipped "${args.subject}" to ${args.to}`,
    );
    return { ok: false, skipped: true };
  }

  try {
    const { error } = await mailer.emails.send({
      from,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
      headers: args.headers,
    });

    if (error) {
      console.error(`[email] send failed: ${error.name} — ${error.message}`);
      return { ok: false, skipped: false, error: error.message };
    }

    return { ok: true, skipped: false };
  } catch (err) {
    // Network-level failure. Never rethrown: see the note on the client above.
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[email] send threw: ${message}`);
    return { ok: false, skipped: false, error: message };
  }
}
