"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditLog, parlays, postLikes, postReposts, postViews, posts, userFollows, users } from "@/db/schema";
import { getAuth, rateLimit } from "@/lib/auth";
import { usernameTaken } from "@/lib/social";
import { postBodySchema, profileSchema } from "@/lib/social-rules";
import { fieldErrorsFrom, type ActionState } from "@/lib/validation";
import { violates } from "@/lib/db-errors";
import { notify, notifyNewPost, unnotify } from "@/lib/notifications";
import { BLOCKED, canInteract } from "@/lib/moderation";

/** Who wrote a post — who hears about a like or a repost of it. */
async function authorOf(postId: string): Promise<string | null> {
  const [row] = await db.select({ id: posts.authorId }).from(posts).where(eq(posts.id, postId)).limit(1);
  return row?.id ?? null;
}

/**
 * Writes for the social layer. Every one of them uses getAuth rather than
 * requireAuth, for the reason setPickFollowAction gives: these controls sit
 * on pages people leave open, and a session that lapsed meanwhile should be a
 * toast, not a 500.
 *
 * Likes and follows take the state the viewer wants rather than toggling, so a
 * double tap or two open tabs settle on the last click instead of racing.
 */

const SIGNED_OUT = "Your session expired — sign in again.";

/** Thirty posts in fifteen minutes is a lot of talking; more is a script. */
const POST_LIMIT = 30;
const POST_WINDOW_MS = 15 * 60 * 1000;

/** Every surface a post or a like can appear on goes stale together. */
function revalidateSocial(username?: string) {
  revalidatePath("/home");
  revalidatePath("/p/[id]", "page");
  if (username) revalidatePath(`/u/${username}`, "layout");
}

/* ----------------------------------------------------------------- posts */

export type CreatePostState =
  | (ActionState & { postId?: string })
  | null;

export async function createPostAction(
  _prev: CreatePostState,
  formData: FormData,
): Promise<CreatePostState> {
  const auth = await getAuth();
  if (!auth) return { ok: false, error: SIGNED_OUT };

  // Plain text: the body, and what it answers or quotes. Nothing attached.
  const parsed = z
    .object({
      body: postBodySchema,
      parentId: z.string().uuid().optional().or(z.literal("")),
      quoteId: z.string().uuid().optional().or(z.literal("")),
    })
    .safeParse({
      body: formData.get("body") ?? "",
      parentId: formData.get("parentId") ?? "",
      quoteId: formData.get("quoteId") ?? "",
    });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check your post", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  if (!(await rateLimit("post:create", auth.user.id, POST_LIMIT, POST_WINDOW_MS))) {
    return { ok: false, error: "You're posting very fast — take a breather and try again shortly." };
  }

  const parentId = parsed.data.parentId || null;
  if (parentId) {
    const [parent] = await db.select({ id: posts.id, authorId: posts.authorId }).from(posts).where(eq(posts.id, parentId)).limit(1);
    if (!parent) return { ok: false, error: "That post was deleted." };
    if (!(await canInteract(auth.user.id, parent.authorId))) return { ok: false, error: BLOCKED };
  }
  const quoteId = parsed.data.quoteId || null;
  if (quoteId) {
    const [quoted] = await db.select({ id: posts.id, authorId: posts.authorId }).from(posts).where(eq(posts.id, quoteId)).limit(1);
    if (!quoted) return { ok: false, error: "That post was deleted." };
    if (!(await canInteract(auth.user.id, quoted.authorId))) return { ok: false, error: BLOCKED };
  }

  const [created] = await db
    .insert(posts)
    .values({ authorId: auth.user.id, parentId, quoteId, body: parsed.data.body })
    .returning({ id: posts.id });

  await notifyNewPost({ id: created.id, authorId: auth.user.id, body: parsed.data.body, parentId, quoteId });
  revalidateSocial(auth.user.username);
  return { ok: true, postId: created.id };
}

export async function deletePostAction(postId: string): Promise<ActionState> {
  const auth = await getAuth();
  if (!auth) return { ok: false, error: SIGNED_OUT };
  if (!z.string().uuid().safeParse(postId).success) return { ok: false, error: "Bad request" };

  const [post] = await db
    .select({ id: posts.id, authorId: posts.authorId, body: posts.body, parlayId: posts.parlayId, username: users.username })
    .from(posts)
    .innerJoin(users, eq(users.id, posts.authorId))
    .where(eq(posts.id, postId))
    .limit(1);
  if (!post) return { ok: true }; // already gone — the outcome they wanted

  const own = post.authorId === auth.user.id;
  if (!own && !auth.isAdmin) return { ok: false, error: "You can only delete your own posts." };

  // Deleting the post that carries a shared parlay unshares the parlay — the
  // ticket itself stays on its builder's My bets.
  await db.transaction(async (tx) => {
    await tx.delete(posts).where(eq(posts.id, postId));
    if (post.parlayId) {
      await tx.update(parlays).set({ shared: false, updatedAt: new Date() }).where(eq(parlays.id, post.parlayId));
    }
  });
  if (post.parlayId) {
    revalidatePath("/picks");
    revalidatePath("/community");
  }

  // A tester deleting their own post is ordinary use. An admin removing
  // someone else's is moderation, and that belongs on the record — with the
  // text, since the row it described no longer exists.
  if (!own) {
    await db.insert(auditLog).values({
      actorId: auth.user.id,
      actorEmail: auth.user.email,
      action: "post.removed",
      entity: "post",
      entityId: postId,
      meta: { author: post.username, body: post.body },
    });
  }

  revalidateSocial(post.username);
  return { ok: true, message: "Post deleted." };
}

/* ----------------------------------------------------------------- likes */

export async function setPostLikeAction(postId: string, liked: boolean): Promise<ActionState> {
  const auth = await getAuth();
  if (!auth) return { ok: false, error: SIGNED_OUT };
  const parsed = z.object({ postId: z.string().uuid(), liked: z.boolean() }).safeParse({ postId, liked });
  if (!parsed.success) return { ok: false, error: "Bad request" };
  if (parsed.data.liked && !(await canInteract(auth.user.id, await authorOf(parsed.data.postId)))) {
    return { ok: false, error: BLOCKED };
  }

  if (parsed.data.liked) {
    try {
      await db
        .insert(postLikes)
        .values({ userId: auth.user.id, postId: parsed.data.postId })
        .onConflictDoNothing();
    } catch (err) {
      // Foreign key: the post was deleted between render and tap.
      if (violates(err, "post_likes_post_id_posts_id_fk")) {
        return { ok: false, error: "That post was deleted." };
      }
      throw err;
    }
    await notify([{ userId: await authorOf(parsed.data.postId), actorId: auth.user.id, kind: "like", postId: parsed.data.postId }]);
  } else {
    await db
      .delete(postLikes)
      .where(and(eq(postLikes.userId, auth.user.id), eq(postLikes.postId, parsed.data.postId)));
    await unnotify({ actorId: auth.user.id, kind: "like", postId: parsed.data.postId });
  }

  // Nothing is revalidated, here or on reposts and votes. Any revalidation
  // re-renders the page the tap came from, and on For you — ranked by
  // engagement — that re-ranked the first page under the rows infinite scroll
  // had already added, so posts repeated or went missing. The button keeps
  // its own state (useKeptOptimistic), and every page renders fresh when it
  // is next opened.
  return { ok: true };
}

/* ----------------------------------------------------------------- views */

/**
 * Records that the signed-in viewer has seen these posts — batched by the
 * browser (components/social/view-tracker.ts). Deliberately revalidates
 * nothing: it fires as you scroll, and re-rendering the page under you for a
 * counter would be worse than the counter catching up on the next load.
 */
export async function recordPostViewsAction(postIds: string[]): Promise<void> {
  const auth = await getAuth();
  if (!auth) return;
  const ids = z.array(z.string().uuid()).max(100).safeParse(postIds);
  if (!ids.success || ids.data.length === 0) return;
  await db
    .insert(postViews)
    .select(
      db
        .select({ postId: posts.id, userId: sql<string>`${auth.user.id}::uuid`.as("user_id"), createdAt: sql<Date>`now()`.as("created_at") })
        .from(posts)
        .where(inArray(posts.id, ids.data)),
    )
    .onConflictDoNothing();
}

/* --------------------------------------------------------------- reposts */

/**
 * Repost ("retweet") or undo it. The post then shows in the reposter's
 * followers' Following feed, at the time of the repost, under "X reposted".
 */
export async function setPostRepostAction(postId: string, reposted: boolean): Promise<ActionState> {
  const auth = await getAuth();
  if (!auth) return { ok: false, error: SIGNED_OUT };
  const parsed = z.object({ postId: z.string().uuid(), reposted: z.boolean() }).safeParse({ postId, reposted });
  if (!parsed.success) return { ok: false, error: "Bad request" };
  if (parsed.data.reposted && !(await canInteract(auth.user.id, await authorOf(parsed.data.postId)))) {
    return { ok: false, error: BLOCKED };
  }

  if (parsed.data.reposted) {
    try {
      await db
        .insert(postReposts)
        .values({ userId: auth.user.id, postId: parsed.data.postId })
        .onConflictDoNothing();
    } catch (err) {
      if (violates(err, "post_reposts_post_id_posts_id_fk")) {
        return { ok: false, error: "That post was deleted." };
      }
      throw err;
    }
    await notify([{ userId: await authorOf(parsed.data.postId), actorId: auth.user.id, kind: "repost", postId: parsed.data.postId }]);
  } else {
    await db
      .delete(postReposts)
      .where(and(eq(postReposts.userId, auth.user.id), eq(postReposts.postId, parsed.data.postId)));
    await unnotify({ actorId: auth.user.id, kind: "repost", postId: parsed.data.postId });
  }

  // Not revalidated — see setPostLikeAction.
  return { ok: true, message: parsed.data.reposted ? "Reposted." : undefined };
}

/* --------------------------------------------------------------- follows */

export async function setUserFollowAction(userId: string, follow: boolean): Promise<ActionState> {
  const auth = await getAuth();
  if (!auth) return { ok: false, error: SIGNED_OUT };
  const parsed = z.object({ userId: z.string().uuid(), follow: z.boolean() }).safeParse({ userId, follow });
  if (!parsed.success) return { ok: false, error: "Bad request" };
  if (parsed.data.userId === auth.user.id) return { ok: false, error: "You can't follow yourself." };

  const [target] = await db
    .select({ username: users.username })
    .from(users)
    .where(eq(users.id, parsed.data.userId))
    .limit(1);
  if (!target) return { ok: false, error: "That account no longer exists." };
  if (parsed.data.follow && !(await canInteract(auth.user.id, parsed.data.userId))) return { ok: false, error: BLOCKED };

  if (parsed.data.follow) {
    await db
      .insert(userFollows)
      .values({ followerId: auth.user.id, followeeId: parsed.data.userId })
      .onConflictDoNothing();
    await notify([{ userId: parsed.data.userId, actorId: auth.user.id, kind: "follow" }]);
  } else {
    await db
      .delete(userFollows)
      .where(
        and(eq(userFollows.followerId, auth.user.id), eq(userFollows.followeeId, parsed.data.userId)),
      );
    await unnotify({ userId: parsed.data.userId, actorId: auth.user.id, kind: "follow" });
  }

  revalidatePath("/home");
  revalidatePath(`/u/${target.username}`, "layout");
  revalidatePath(`/u/${auth.user.username}`, "layout");
  return { ok: true };
}

/* --------------------------------------------------------------- profile */

export async function updateProfileAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await getAuth();
  if (!auth) return { ok: false, error: SIGNED_OUT };

  const parsed = profileSchema.safeParse({
    displayName: formData.get("displayName") ?? "",
    username: formData.get("username") ?? "",
    bio: formData.get("bio") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: "Check the fields below", fieldErrors: fieldErrorsFrom(parsed.error) };
  }
  const { displayName, username, bio } = parsed.data;

  if (await usernameTaken(username, auth.user.id)) {
    return { ok: false, error: "Check the fields below", fieldErrors: { username: ["That handle is taken"] } };
  }

  try {
    await db
      .update(users)
      .set({ displayName, username, bio: bio || null, updatedAt: new Date() })
      .where(eq(users.id, auth.user.id));
  } catch (err) {
    // Two people claiming the same free handle at once: the index decides.
    if (violates(err, "users_username_unique")) {
      return { ok: false, error: "Check the fields below", fieldErrors: { username: ["That handle is taken"] } };
    }
    throw err;
  }

  revalidatePath("/account");
  revalidateSocial(username);
  if (username !== auth.user.username) revalidatePath(`/u/${auth.user.username}`, "layout");
  return { ok: true, message: "Profile saved." };
}
