"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditLog, parlays, postLikes, postReposts, posts, userFollows, users } from "@/db/schema";
import { getAuth, rateLimit } from "@/lib/auth";
import { getLinkPreview, normalizeLinkUrl } from "@/lib/link-preview";
import { usernameTaken, type PostPreview } from "@/lib/social";
import { extractCardUrl, postBodySchema, profileSchema } from "@/lib/social-rules";
import { fieldErrorsFrom, type ActionState } from "@/lib/validation";

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
/** The composer previews as you type, so this one is looser. */
const PREVIEW_LIMIT = 60;

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

  const parsed = z
    .object({
      body: postBodySchema,
      parentId: z.string().uuid().optional().or(z.literal("")),
    })
    .safeParse({ body: formData.get("body") ?? "", parentId: formData.get("parentId") ?? "" });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check your post", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  if (!(await rateLimit("post:create", auth.user.id, POST_LIMIT, POST_WINDOW_MS))) {
    return { ok: false, error: "You're posting very fast — take a breather and try again shortly." };
  }

  const parentId = parsed.data.parentId || null;
  if (parentId) {
    const [parent] = await db.select({ id: posts.id }).from(posts).where(eq(posts.id, parentId)).limit(1);
    if (!parent) return { ok: false, error: "That post was deleted." };
  }

  // The card is resolved before the insert so the post never renders twice —
  // once bare, then again with its card. The composer has usually warmed the
  // cache already (previewLinkAction), which makes this a single indexed read.
  const cardUrl = extractCardUrl(parsed.data.body);
  const linkUrl = cardUrl ? normalizeLinkUrl(cardUrl) : null;
  if (linkUrl) await getLinkPreview(linkUrl);

  const [created] = await db
    .insert(posts)
    .values({ authorId: auth.user.id, parentId, body: parsed.data.body, linkUrl })
    .returning({ id: posts.id });

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
  if (post.parlayId) revalidatePath("/picks");

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

  if (parsed.data.liked) {
    try {
      await db
        .insert(postLikes)
        .values({ userId: auth.user.id, postId: parsed.data.postId })
        .onConflictDoNothing();
    } catch (err) {
      // Foreign key: the post was deleted between render and tap.
      if (String(err).includes("post_likes_post_id_posts_id_fk")) {
        return { ok: false, error: "That post was deleted." };
      }
      throw err;
    }
  } else {
    await db
      .delete(postLikes)
      .where(and(eq(postLikes.userId, auth.user.id), eq(postLikes.postId, parsed.data.postId)));
  }

  revalidateSocial();
  return { ok: true };
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

  if (parsed.data.reposted) {
    try {
      await db
        .insert(postReposts)
        .values({ userId: auth.user.id, postId: parsed.data.postId })
        .onConflictDoNothing();
    } catch (err) {
      if (String(err).includes("post_reposts_post_id_posts_id_fk")) {
        return { ok: false, error: "That post was deleted." };
      }
      throw err;
    }
  } else {
    await db
      .delete(postReposts)
      .where(and(eq(postReposts.userId, auth.user.id), eq(postReposts.postId, parsed.data.postId)));
  }

  revalidateSocial(auth.user.username);
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

  if (parsed.data.follow) {
    await db
      .insert(userFollows)
      .values({ followerId: auth.user.id, followeeId: parsed.data.userId })
      .onConflictDoNothing();
  } else {
    await db
      .delete(userFollows)
      .where(
        and(eq(userFollows.followerId, auth.user.id), eq(userFollows.followeeId, parsed.data.userId)),
      );
  }

  revalidatePath("/home");
  revalidatePath(`/u/${target.username}`, "layout");
  revalidatePath(`/u/${auth.user.username}`, "layout");
  return { ok: true };
}

/* ---------------------------------------------------------- link preview */

/**
 * The card the composer shows while you type, as X does. Also warms the cache
 * createPostAction reads, so posting a link is not a second network fetch.
 */
export async function previewLinkAction(rawUrl: string): Promise<PostPreview | null> {
  const auth = await getAuth();
  if (!auth) return null;
  if (typeof rawUrl !== "string" || rawUrl.length > 2000) return null;
  const url = normalizeLinkUrl(rawUrl);
  if (!url) return null;
  if (!(await rateLimit("post:preview", auth.user.id, PREVIEW_LIMIT, POST_WINDOW_MS))) return null;

  const preview = await getLinkPreview(url);
  if (!preview) return null;
  return {
    url: preview.url,
    title: preview.title,
    description: preview.description,
    imageUrl: preview.imageUrl,
    siteName: preview.siteName,
    cardType: preview.cardType,
  };
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
    if (String(err).includes("users_username_unique")) {
      return { ok: false, error: "Check the fields below", fieldErrors: { username: ["That handle is taken"] } };
    }
    throw err;
  }

  revalidatePath("/account");
  revalidateSocial(username);
  if (username !== auth.user.username) revalidatePath(`/u/${auth.user.username}`, "layout");
  return { ok: true, message: "Profile saved." };
}
