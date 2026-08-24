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
