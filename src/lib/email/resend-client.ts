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
}

export async function sendEmail({ to, subject, html, text }: SendEmailArgs): Promise<void> {
  if (!from) {
    throw new Error("EMAIL_FROM is not set — see .env.example.");
  }

  const { error } = await resend().emails.send({ from, to, subject, html, text });
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
    const payload = chunk.map((to) => ({ from: from!, to, subject, html, text }));

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
