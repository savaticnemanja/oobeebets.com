"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { db } from "@/db";
import { auditLog } from "@/db/schema";
import type { AuthContext } from "@/lib/auth";
import { clientIp, rateLimit, requireAdmin } from "@/lib/auth";
import { resolveAudience } from "@/lib/announcements";
import { sendBulkEmail, sendEmail } from "@/lib/email/resend-client";
import { announcementEmail } from "@/lib/email/templates";
import {
  announcementSchema,
  AUDIENCE_LABELS,
  fieldErrorsFrom,
  MAX_ANNOUNCEMENT_RECIPIENTS,
  type ActionState,
} from "@/lib/validation";

/** A broadcast is not undoable, so the limit is deliberately tight. */
const SEND_LIMIT = 5;
const SEND_WINDOW_MS = 60 * 60 * 1000;

async function audit(
  actor: AuthContext,
  action: string,
  meta: Record<string, unknown>,
) {
  await db.insert(auditLog).values({
    actorId: actor.user.id,
    actorEmail: actor.user.email,
    action,
    entity: "announcement",
    entityId: null,
    meta,
  });
}

/**
 * Sends the composed email to the sending admin's own address and nobody else.
 *
 * The audience is ignored entirely rather than trusted-and-overridden: this
 * path cannot reach another person's inbox no matter what is posted to it,
 * which is the property that makes it safe to click while still drafting.
 */
export async function sendTestAnnouncementAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireAdmin();

  const parsed = announcementSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Check the fields below",
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }

  const { subject, html, text } = announcementEmail({
    heading: parsed.data.heading,
    body: parsed.data.body,
  });

  try {
    await sendEmail({ to: actor.user.email, subject, html, text });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Could not send the test: ${message}` };
  }

  await audit(actor, "announcement.tested", { heading: parsed.data.heading });
  return { ok: true, message: `Test sent to ${actor.user.email}.` };
}

/* ------------------------------------------------------------ the real send */

export async function sendAnnouncementAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireAdmin();

  const parsed = announcementSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Check the fields below",
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }
  const { heading, body, audience, recipients: rawRecipients } = parsed.data;

  // Typed into the confirm dialog. The client will not submit without it, but
  // the guard belongs on the side that actually sends.
  if (formData.get("confirm") !== "SEND") {
    return { ok: false, error: "Type SEND in the confirmation box to send." };
  }

  const h = await headers();
  if (!(await rateLimit("announce", clientIp(h), SEND_LIMIT, SEND_WINDOW_MS))) {
    return { ok: false, error: "Too many sends in the last hour. Try again later." };
  }

  const { recipients, invalid } = await resolveAudience(audience, rawRecipients);

  if (invalid.length > 0) {
    return {
      ok: false,
      error: `Not a valid email address: ${invalid.slice(0, 3).join(", ")}${
        invalid.length > 3 ? ` (+${invalid.length - 3} more)` : ""
      }`,
      fieldErrors: { recipients: ["Fix or remove these addresses"] },
    };
  }

  if (recipients.length === 0) {
    return { ok: false, error: "That audience has nobody in it." };
  }

  if (recipients.length > MAX_ANNOUNCEMENT_RECIPIENTS) {
    return {
      ok: false,
      error: `${recipients.length} recipients is over the ${MAX_ANNOUNCEMENT_RECIPIENTS} cap for one send.`,
    };
  }

  const { subject, html, text } = announcementEmail({ heading, body });

  let result;
  try {
    result = await sendBulkEmail(recipients, { subject, html, text });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await audit(actor, "announcement.failed", { heading, audience, error: message });
    return { ok: false, error: `Could not send: ${message}` };
  }

  // Logged before the early return below, so a partial send is on the record
  // with the same detail a clean one gets.
  await audit(actor, "announcement.sent", {
    heading,
    audience,
    audienceLabel: AUDIENCE_LABELS[audience],
    requested: recipients.length,
    sent: result.sent,
    failed: result.failed,
  });

  revalidatePath("/admin/announce");

  if (result.failed.length > 0) {
    const missed = recipients.length - result.sent;
    return {
      ok: false,
      error: `Sent to ${result.sent} of ${recipients.length}. ${missed} failed: ${result.failed[0].message}`,
    };
  }

  return {
    ok: true,
    message: `Announcement sent to ${result.sent} ${result.sent === 1 ? "person" : "people"}.`,
  };
}
