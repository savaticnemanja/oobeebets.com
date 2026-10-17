"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { auditLog } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { signupEnabled } from "@/lib/signup";
import type { ActionState } from "@/lib/validation";
import { inviteFromWaitlist, notifyWaitlist } from "@/lib/waitlist";

/** Let one person in: a normal invite to their address, remembered on their row. */
export async function inviteFromWaitlistAction(id: string): Promise<ActionState> {
  const actor = await requireAdmin();
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "No such entry" };

  let email: string | null;
  try {
    email = await inviteFromWaitlist(id, actor.user.id);
  } catch (err) {
    console.error("[waitlist] invite failed:", err);
    return { ok: false, error: "The invite couldn't be sent — try again." };
  }
  if (!email) return { ok: false, error: "They've left the waitlist, or haven't confirmed their address yet." };

  await db.insert(auditLog).values({
    actorId: actor.user.id,
    actorEmail: actor.user.email,
    action: "waitlist.invited",
    entity: "waitlist",
    entityId: id,
    meta: { email },
  });
  revalidatePath("/admin/waitlist");
  return { ok: true, message: `Invite sent to ${email}` };
}

/**
 * "Sign-ups are open" to everyone waiting who hasn't been told. Only once
 * SIGNUP_ENABLED is on — the email's whole message is "come and sign up".
 */
export async function notifyWaitlistAction(): Promise<ActionState> {
  const actor = await requireAdmin();
  if (!signupEnabled()) return { ok: false, error: "Sign-ups are closed — set SIGNUP_ENABLED=1 first." };

  const { sent, failed } = await notifyWaitlist();
  await db.insert(auditLog).values({
    actorId: actor.user.id,
    actorEmail: actor.user.email,
    action: "waitlist.notified",
    entity: "waitlist",
    meta: { sent, failed },
  });
  revalidatePath("/admin/waitlist");
  if (sent === 0 && failed === 0) return { ok: true, message: "Nobody left to tell." };
  return failed > 0
    ? { ok: false, error: `Sent ${sent}; ${failed} failed — run it again to retry those.` }
    : { ok: true, message: `Told ${sent} ${sent === 1 ? "person" : "people"} that sign-ups are open.` };
}
