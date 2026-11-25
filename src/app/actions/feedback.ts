"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditLog, feedback } from "@/db/schema";
import { getAuth, rateLimit, requireAdmin } from "@/lib/auth";
import { SITE } from "@/lib/site";
import { feedbackTicket, sendTicket } from "@/lib/tracker";
import { feedbackSchema, fieldErrorsFrom, type ActionState } from "@/lib/validation";

/** Plenty for someone reporting as they go; not enough to flood the inbox. */
const SEND_LIMIT = 10;
const SEND_WINDOW_MS = 60 * 60 * 1000;

/**
 * From a tester, through "Send feedback" in the sidebar or the phone drawer.
 * Saved for /admin/feedback and filed as a ticket in the external tracker.
 */
export async function sendFeedbackAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await getAuth();
  if (!auth) return { ok: false, error: "Your session expired — sign in again." };

  const parsed = feedbackSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Check the form",
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }

  if (!(await rateLimit("feedback:send", auth.user.id, SEND_LIMIT, SEND_WINDOW_MS))) {
    return { ok: false, error: "That's a lot of feedback in one hour — try again a little later." };
  }

  const h = await headers();
  const [row] = await db
    .insert(feedback)
    .values({
      userId: auth.user.id,
      kind: parsed.data.kind,
      body: parsed.data.body,
      pagePath: parsed.data.pagePath || null,
      userAgent: h.get("user-agent")?.slice(0, 500) ?? null,
    })
    .returning({ id: feedback.id, kind: feedback.kind, body: feedback.body, pagePath: feedback.pagePath, userAgent: feedback.userAgent });

  // Also a ticket in the external tracker (TRACKER_API_KEY); sent in the
  // background, so a slow or down tracker never holds up the reply.
  if (row) {
    sendTicket(
      feedbackTicket({
        ...row,
        user: { id: auth.user.id, email: auth.user.email, username: auth.user.username, displayName: auth.user.displayName },
        siteUrl: SITE.url,
      }),
    );
  }

  revalidatePath("/admin/feedback");
  revalidatePath("/admin");
  return { ok: true, message: "Thanks — the team will read it." };
}

/** Admins close an item once it's dealt with, and can reopen it. */
export async function setFeedbackResolvedAction(
  id: string,
  resolved: boolean,
): Promise<ActionState> {
  const actor = await requireAdmin();
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "No such feedback" };

  const [row] = await db
    .update(feedback)
    .set(resolved ? { resolvedAt: new Date(), resolvedBy: actor.user.id } : { resolvedAt: null, resolvedBy: null })
    .where(eq(feedback.id, id))
    .returning({ id: feedback.id });
  if (!row) return { ok: false, error: "That feedback was deleted." };

  await db.insert(auditLog).values({
    actorId: actor.user.id,
    actorEmail: actor.user.email,
    action: resolved ? "feedback.resolved" : "feedback.reopened",
    entity: "feedback",
    entityId: id,
  });

  revalidatePath("/admin/feedback");
  revalidatePath("/admin");
  return { ok: true };
}
