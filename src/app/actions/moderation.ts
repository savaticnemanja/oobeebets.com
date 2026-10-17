"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditLog, posts, reports, userBlocks, userFollows, userMutes, users } from "@/db/schema";
import { getAuth, rateLimit, requireAdmin } from "@/lib/auth";
import { deletePostAction } from "@/app/actions/social";
import type { ActionState } from "@/lib/validation";

/**
 * Mute, block and report — and the admins' side of a report. The rules for
 * what a mute or block hides and forbids are in lib/moderation.ts; these
 * only record them. Like the other social writes, each takes the state the
 * viewer wants rather than toggling.
 */

const SIGNED_OUT = "Your session expired — sign in again.";
const uuid = z.string().uuid();

/** Feeds and profiles change shape on a mute or block; render them fresh. */
function revalidateFeeds(...usernames: string[]) {
  revalidatePath("/home");
  revalidatePath("/community");
  revalidatePath("/notifications");
  for (const u of usernames) revalidatePath(`/u/${u}`, "layout");
}

async function usernameOf(id: string): Promise<string | null> {
  const [row] = await db.select({ username: users.username }).from(users).where(eq(users.id, id)).limit(1);
  return row?.username ?? null;
}

export async function setMuteAction(userId: string, muted: boolean): Promise<ActionState> {
  const auth = await getAuth();
  if (!auth) return { ok: false, error: SIGNED_OUT };
  if (!uuid.safeParse(userId).success) return { ok: false, error: "Bad request" };
  if (userId === auth.user.id) return { ok: false, error: "You can't mute yourself." };
  const username = await usernameOf(userId);
  if (!username) return { ok: false, error: "That account no longer exists." };

  if (muted) await db.insert(userMutes).values({ userId: auth.user.id, mutedId: userId }).onConflictDoNothing();
  else await db.delete(userMutes).where(and(eq(userMutes.userId, auth.user.id), eq(userMutes.mutedId, userId)));
  revalidateFeeds(username);
  return { ok: true, message: muted ? `Muted @${username}. You won't see their posts.` : `Unmuted @${username}.` };
}

/**
 * Block: also ends the follows between you, both ways — a block that left
 * them following you would still put your posts in their Following feed.
 */
export async function setBlockAction(userId: string, blocked: boolean): Promise<ActionState> {
  const auth = await getAuth();
  if (!auth) return { ok: false, error: SIGNED_OUT };
  if (!uuid.safeParse(userId).success) return { ok: false, error: "Bad request" };
  if (userId === auth.user.id) return { ok: false, error: "You can't block yourself." };
  const username = await usernameOf(userId);
  if (!username) return { ok: false, error: "That account no longer exists." };

  if (blocked) {
    await db.transaction(async (tx) => {
      await tx.insert(userBlocks).values({ blockerId: auth.user.id, blockedId: userId }).onConflictDoNothing();
      await tx
        .delete(userFollows)
        .where(
          or(
            and(eq(userFollows.followerId, auth.user.id), eq(userFollows.followeeId, userId)),
            and(eq(userFollows.followerId, userId), eq(userFollows.followeeId, auth.user.id)),
          ),
        );
    });
  } else {
    await db.delete(userBlocks).where(and(eq(userBlocks.blockerId, auth.user.id), eq(userBlocks.blockedId, userId)));
  }
  revalidateFeeds(username, auth.user.username);
  return { ok: true, message: blocked ? `Blocked @${username}.` : `Unblocked @${username}.` };
}

const reportSchema = z
  .object({
    postId: uuid.optional(),
    userId: uuid.optional(),
    reason: z.enum(["spam", "harassment", "hate", "scam", "other"]),
    note: z.string().trim().max(500, "Keep it under 500 characters").optional(),
  })
  .refine((r) => r.postId || r.userId, "Nothing to report");

/** A report, for the admins' queue. Twenty an hour is plenty for anyone acting in good faith. */
export async function reportAction(input: { postId?: string; userId?: string; reason: string; note?: string }): Promise<ActionState> {
  const auth = await getAuth();
  if (!auth) return { ok: false, error: SIGNED_OUT };
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Bad request" };
  if (!(await rateLimit("report", auth.user.id, 20, 60 * 60 * 1000))) {
    return { ok: false, error: "That's a lot of reports — try again in a while." };
  }

  let target = parsed.data.userId ?? null;
  let body: string | null = null;
  if (parsed.data.postId) {
    const [post] = await db
      .select({ authorId: posts.authorId, body: posts.body })
      .from(posts)
      .where(eq(posts.id, parsed.data.postId))
      .limit(1);
    if (!post) return { ok: false, error: "That post was already deleted." };
    target = post.authorId;
    body = post.body;
  }
  if (target === auth.user.id) return { ok: false, error: "You can't report yourself." };

  await db.insert(reports).values({
    reporterId: auth.user.id,
    postId: parsed.data.postId ?? null,
    targetUserId: target,
    postBody: body,
    reason: parsed.data.reason,
    note: parsed.data.note || null,
  });
  revalidatePath("/admin/reports");
  revalidatePath("/admin");
  return { ok: true, message: "Thanks — an admin will look at it." };
}

/**
 * The admins' answer to a report: take the post down (which closes every
 * open report on it), or dismiss this one. Both on the audit log.
 */
export async function resolveReportAction(reportId: string, outcome: "removed" | "dismissed"): Promise<ActionState> {
  const actor = await requireAdmin();
  if (!uuid.safeParse(reportId).success || !["removed", "dismissed"].includes(outcome)) return { ok: false, error: "Bad request" };
  const [report] = await db.select().from(reports).where(eq(reports.id, reportId)).limit(1);
  if (!report) return { ok: false, error: "That report is gone." };

  const resolved = { outcome, resolvedAt: new Date(), resolvedBy: actor.user.id };
  if (outcome === "removed") {
    if (!report.postId) return { ok: false, error: "There's no post to remove — the report is about an account." };
    const postId = report.postId;
    // Close every open report on the post first: removing it nulls their post_id.
    await db.update(reports).set(resolved).where(and(eq(reports.postId, postId), isNull(reports.resolvedAt)));
    const result = await deletePostAction(postId);
    if (result && !result.ok) return result;
  } else {
    await db.update(reports).set(resolved).where(eq(reports.id, reportId));
  }

  await db.insert(auditLog).values({
    actorId: actor.user.id,
    actorEmail: actor.user.email,
    action: outcome === "removed" ? "report.post_removed" : "report.dismissed",
    entity: "report",
    entityId: reportId,
    meta: { reason: report.reason },
  });
  revalidatePath("/admin/reports");
  revalidatePath("/admin");
  return { ok: true, message: outcome === "removed" ? "Post removed." : "Report dismissed." };
}
