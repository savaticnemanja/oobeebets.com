"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditLog, parlays, pollOptions, pollVotes, postLikes, postMedia, postPolls, postReposts, postViews, posts, userFollows, users } from "@/db/schema";
import { MAX_MEDIA_PER_POST } from "@/lib/media";
import { gifSearchConfigured, isGiphyUrl, searchGifs, type GifResult } from "@/lib/giphy";
import { getAuth, rateLimit } from "@/lib/auth";
import { getLinkPreview, normalizeLinkUrl } from "@/lib/link-preview";
import { usernameTaken, type PostPreview } from "@/lib/social";
import { extractCardUrl, pollSchema, postBodyOptionalSchema, profileSchema } from "@/lib/social-rules";
import { fieldErrorsFrom, type ActionState } from "@/lib/validation";
import { violates } from "@/lib/db-errors";

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

  // Attachments arrive as JSON in hidden fields: uploaded media ids, a GIF
  // picked from GIPHY, or a poll. One kind per post, as on X.
  const json = (key: string) => {
    const raw = formData.get(key);
    if (typeof raw !== "string" || raw === "") return undefined;
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  };
  const parsed = z
    .object({
      body: postBodyOptionalSchema,
      parentId: z.string().uuid().optional().or(z.literal("")),
      mediaIds: z.array(z.string().uuid()).max(MAX_MEDIA_PER_POST, `At most ${MAX_MEDIA_PER_POST} photos`).optional(),
      gif: z
        .object({ url: z.string().url().refine(isGiphyUrl, "That GIF isn't from GIPHY"), width: z.number().int().positive(), height: z.number().int().positive() })
        .optional(),
      poll: pollSchema.optional(),
    })
    .safeParse({
      body: formData.get("body") ?? "",
      parentId: formData.get("parentId") ?? "",
      mediaIds: json("mediaIds"),
      gif: json("gif"),
      poll: json("poll"),
    });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check your post", fieldErrors: fieldErrorsFrom(parsed.error) };
  }
  const mediaIds = parsed.data.mediaIds ?? [];
  const { gif, poll } = parsed.data;
  const kinds = [mediaIds.length > 0, Boolean(gif), Boolean(poll)].filter(Boolean).length;
  if (kinds > 1) return { ok: false, error: "A post can have photos, a GIF or a poll — one of them." };
  if (!parsed.data.body && (kinds === 0 || poll)) {
    return { ok: false, error: poll ? "Ask a question for your poll" : "Write something first" };
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

  // The uploads must be this person's own and not already on a post. An
  // uploaded GIF goes alone, as a GIF does on X.
  if (mediaIds.length > 0) {
    const owned = await db
      .select({ id: postMedia.id, kind: postMedia.kind })
      .from(postMedia)
      .where(and(inArray(postMedia.id, mediaIds), eq(postMedia.uploaderId, auth.user.id), isNull(postMedia.postId)));
    if (owned.length !== mediaIds.length) return { ok: false, error: "A photo didn't finish uploading — remove it and add it again." };
    if (owned.some((m) => m.kind === "gif") && owned.length > 1) return { ok: false, error: "A GIF goes on its own." };
  }

  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(posts)
      .values({ authorId: auth.user.id, parentId, body: parsed.data.body, linkUrl })
      .returning({ id: posts.id });
    for (const [position, id] of mediaIds.entries()) {
      await tx.update(postMedia).set({ postId: row.id, position }).where(eq(postMedia.id, id));
    }
    if (gif) {
      await tx.insert(postMedia).values({
        postId: row.id,
        uploaderId: auth.user.id,
        kind: "gif",
        mime: "image/gif",
        url: gif.url,
        width: gif.width,
        height: gif.height,
      });
    }
    if (poll) {
      await tx.insert(postPolls).values({ postId: row.id, endsAt: new Date(Date.now() + poll.hours * 3600_000) });
      await tx.insert(pollOptions).values(poll.options.map((label, position) => ({ postId: row.id, position, label })));
    }
    return row;
  });

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
  } else {
    await db
      .delete(postLikes)
      .where(and(eq(postLikes.userId, auth.user.id), eq(postLikes.postId, parsed.data.postId)));
  }

  revalidateSocial();
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

/* ----------------------------------------------------------------- polls */

/**
 * Vote in a poll. One vote, final — as on X — and not on your own poll or
 * one that has closed.
 */
export async function votePollAction(postId: string, optionId: string): Promise<ActionState> {
  const auth = await getAuth();
  if (!auth) return { ok: false, error: SIGNED_OUT };
  const ids = z.object({ postId: z.string().uuid(), optionId: z.string().uuid() }).safeParse({ postId, optionId });
  if (!ids.success) return { ok: false, error: "Bad request" };

  const [poll] = await db
    .select({ endsAt: postPolls.endsAt, authorId: posts.authorId, optionPost: pollOptions.postId })
    .from(postPolls)
    .innerJoin(posts, eq(posts.id, postPolls.postId))
    .leftJoin(pollOptions, and(eq(pollOptions.id, ids.data.optionId), eq(pollOptions.postId, postPolls.postId)))
    .where(eq(postPolls.postId, ids.data.postId))
    .limit(1);
  if (!poll || !poll.optionPost) return { ok: false, error: "That poll is gone." };
  if (poll.endsAt.getTime() <= Date.now()) return { ok: false, error: "This poll has closed." };
  if (poll.authorId === auth.user.id) return { ok: false, error: "You can't vote in your own poll." };

  await db
    .insert(pollVotes)
    .values({ postId: ids.data.postId, userId: auth.user.id, optionId: ids.data.optionId })
    .onConflictDoNothing();
  revalidateSocial();
  return { ok: true };
}

/* ------------------------------------------------------------------- gifs */

/** GIF search for the composer's picker; `configured` false means no GIPHY key yet. */
export async function searchGifsAction(query: string): Promise<{ configured: boolean; results: GifResult[]; error?: string }> {
  const auth = await getAuth();
  if (!auth) return { configured: false, results: [], error: SIGNED_OUT };
  if (!gifSearchConfigured()) return { configured: false, results: [] };
  try {
    return { configured: true, results: await searchGifs(String(query).slice(0, 50)) };
  } catch {
    return { configured: true, results: [], error: "GIF search isn't answering — try again." };
  }
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
      if (violates(err, "post_reposts_post_id_posts_id_fk")) {
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
