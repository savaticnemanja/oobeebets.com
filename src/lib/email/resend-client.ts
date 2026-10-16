import "server-only";
import { Resend } from "resend";

/**
 * Invitations have no delivery path other than email — unlike a nice-to-have
 * welcome note, a send that silently no-ops leaves an admin believing someone
 * was invited when nobody was. So this fails loudly rather than degrading: a
 * missing key or a rejected send throws, and the caller (sendInviteAction)
 * turns that into an actionable error instead of a false "sent".
 */
const apiKey = process.env.RESEND_API_KEY;
const from = process.env.EMAIL_FROM;

/**
 * Optional. The sender is a noreply address, so without this a tester who hits
 * reply on their invite is writing to nobody — the one mail in the product that
 * most invites a reply.
 */
const replyTo = process.env.EMAIL_REPLY_TO?.trim() || undefined;

/**
 * Namespaces idempotency keys per deployment. Beta and production share one
 * Resend key by deliberate choice, and a key means "this exact send already
 * happened" to the account, not to the environment.
 */
const idempotencyPrefix = process.env.EMAIL_IDEMPOTENCY_PREFIX?.trim() || "oobeebets";

/** Resend caps the key at 256 characters and scopes it to a 24-hour window. */
export function idempotencyKey(...parts: string[]): string {
  return `${idempotencyPrefix}:${parts.join(":")}`.slice(0, 256);
}

let client: Resend | null = null;

function resend(): Resend {
  if (!apiKey) {
    throw new Error(
      "RESEND_API_KEY is not set — set one from https://resend.com/api-keys before sending invites.",
    );
  }
  client ??= new Resend(apiKey);
  return client;
}

export interface SendEmailArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
  /**
   * Makes a retry safe. Resend drops a second send carrying a key it has
   * already seen in the last 24 hours, so this must identify the *send*, not
   * the recipient: keyed on an address alone, a deliberate resend to the same
   * person would be swallowed. See issueInvite, which keys on the token.
   */
  idempotencyKey?: string;
  /** Extra headers — List-Unsubscribe on waitlist mail (see lib/waitlist.ts). */
  headers?: Record<string, string>;
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
  idempotencyKey: key,
  headers,
}: SendEmailArgs): Promise<void> {
  if (!from) {
    throw new Error("EMAIL_FROM is not set — see .env.example.");
  }

  const { error } = await resend().emails.send(
    { from, to, subject, html, text, replyTo, headers },
    key ? { idempotencyKey: key } : undefined,
  );
  if (error) {
    throw new Error(`Resend rejected the email: ${error.name} — ${error.message}`);
  }
}

/** Resend's batch endpoint takes at most this many messages per call. */
const BATCH_LIMIT = 100;

export interface BulkResult {
  sent: number;
  failed: { chunk: number; message: string }[];
}

/**
 * One message per recipient, not one message with many recipients.
 *
 * A shared `to` would show every tester the address of every other tester,
 * which is a privacy breach that cannot be taken back once the mail has left.
 * `batch.send` posts up to a hundred *separate* emails in one request, so this
 * stays one API call per hundred people without ever putting two of them in
 * the same envelope.
 *
 * A failed chunk does not abort the rest: with a broadcast, the useful outcome
 * is "these 140 went, these 10 didn't, here's why", not an exception that
 * leaves the caller unable to say who received anything.
 */
export async function sendBulkEmail(
  recipients: string[],
  { subject, html, text }: Omit<SendEmailArgs, "to">,
): Promise<BulkResult> {
  if (!from) {
    throw new Error("EMAIL_FROM is not set — see .env.example.");
  }

  const result: BulkResult = { sent: 0, failed: [] };
  const client = resend();

  for (let i = 0; i < recipients.length; i += BATCH_LIMIT) {
    const chunk = recipients.slice(i, i + BATCH_LIMIT);
    const payload = chunk.map((to) => ({ from: from!, to, subject, html, text, replyTo }));

    try {
      const { error } = await client.batch.send(payload);
      if (error) {
        result.failed.push({
          chunk: chunk.length,
          message: `${error.name} — ${error.message}`,
        });
        continue;
      }
      result.sent += chunk.length;
    } catch (err) {
      result.failed.push({
        chunk: chunk.length,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}

/**
 * Different mail to each recipient, a hundred per request — the waitlist's
 * "sign-ups are open", where every message carries its reader's own link.
 * Returns the addresses that went, so the caller records exactly those.
 */
export async function sendEmailBatch(messages: SendEmailArgs[]): Promise<{ sent: string[]; failed: string[] }> {
  if (!from) {
    throw new Error("EMAIL_FROM is not set — see .env.example.");
  }
  const out = { sent: [] as string[], failed: [] as string[] };
  const client = resend();
  for (let i = 0; i < messages.length; i += BATCH_LIMIT) {
    const chunk = messages.slice(i, i + BATCH_LIMIT);
    const to = chunk.map((m) => m.to);
    try {
      const { error } = await client.batch.send(
        chunk.map((m) => ({ from: from!, to: m.to, subject: m.subject, html: m.html, text: m.text, replyTo, headers: m.headers })),
      );
      if (error) {
        console.error(`[email] batch of ${chunk.length} rejected: ${error.name} — ${error.message}`);
        out.failed.push(...to);
      } else {
        out.sent.push(...to);
      }
    } catch (err) {
      console.error(`[email] batch of ${chunk.length} failed:`, err);
      out.failed.push(...to);
    }
  }
  return out;
}
