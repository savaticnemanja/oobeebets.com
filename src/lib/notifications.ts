import "server-only";
import { and, count, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { notifications, posts, users, type NotificationKind, type Role } from "@/db/schema";
import { getParlaysByIds } from "@/lib/parlay-store";
import { extractMentions } from "@/lib/social-rules";
import { getPostsByIds, withAttachments, type FeedPost } from "@/lib/social";

/**
 * Notifications: written by the action that caused one, removed when it's
 * undone. Writing is best effort — a like that saved but couldn't notify is
 * still a like, so a failure here is logged and never fails the action.
 */

interface Target {
  /** Who it's for. Nobody is notified about their own doing. */
  userId: string | null | undefined;
  actorId: string;
  kind: NotificationKind;
  postId?: string | null;
  parlayId?: string | null;
}

export async function notify(targets: Target[]): Promise<void> {
  const rows = targets
    .filter((t): t is Target & { userId: string } => Boolean(t.userId) && t.userId !== t.actorId)
    .map((t) => ({ userId: t.userId, actorId: t.actorId, kind: t.kind, postId: t.postId ?? null, parlayId: t.parlayId ?? null }));
  if (rows.length === 0) return;
  try {
    await db.insert(notifications).values(rows).onConflictDoNothing();
  } catch (err) {
    console.error("[notifications] could not write", err);
  }
}

/**
 * The opposite of notify: the like, repost, follow or play was taken back.
 * A follow points at nothing but the person, so it needs `userId` — without
 * it, one unfollow would clear that actor's follow notice for everyone.
 */
export async function unnotify(t: Omit<Target, "userId"> & { userId?: string }): Promise<void> {
  try {
    await db
      .delete(notifications)
      .where(
        and(
          t.userId ? eq(notifications.userId, t.userId) : undefined,
          eq(notifications.actorId, t.actorId),
          eq(notifications.kind, t.kind),
          t.postId ? eq(notifications.postId, t.postId) : isNull(notifications.postId),
          t.parlayId ? eq(notifications.parlayId, t.parlayId) : isNull(notifications.parlayId),
        ),
      );
  } catch (err) {
    console.error("[notifications] could not remove", err);
  }
}

/**
 * A new post: its parent's author hears about the reply, a quoted post's
 * author about the quote, and everyone it @mentions about the mention —
 * except whoever already heard about the reply or the quote.
 */
export async function notifyNewPost(post: { id: string; authorId: string; body: string; parentId: string | null; quoteId?: string | null }) {
  try {
    const authorOf = async (id: string | null | undefined) =>
      id ? (await db.select({ id: posts.authorId }).from(posts).where(eq(posts.id, id)).limit(1))[0]?.id : null;
    const [parentAuthor, quotedAuthor] = await Promise.all([authorOf(post.parentId), authorOf(post.quoteId)]);
    const handles = extractMentions(post.body);
    const mentioned = handles.length
      ? await db.select({ id: users.id }).from(users).where(inArray(users.username, handles))
      : [];
    await notify([
      { userId: parentAuthor, actorId: post.authorId, kind: "reply", postId: post.id },
      // Quoting someone you're also replying to is one notice, the reply.
      ...(quotedAuthor !== parentAuthor ? [{ userId: quotedAuthor, actorId: post.authorId, kind: "quote" as const, postId: post.id }] : []),
      ...mentioned
        .filter((u) => u.id !== parentAuthor && u.id !== quotedAuthor)
        .map((u) => ({ userId: u.id, actorId: post.authorId, kind: "mention" as const, postId: post.id })),
    ]);
  } catch (err) {
    console.error("[notifications] could not notify for post", err);
  }
}

/* -------------------------------------------------------------- reading */

export async function unreadCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return row?.n ?? 0;
}

/** Everything up to `upTo` — what the page showing them was rendered from. */
export async function markAllRead(userId: string, upTo: Date): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt), lte(notifications.createdAt, upTo)));
}

export type NotificationTab = "all" | "mentions";

export interface Actor {
  id: string;
  username: string;
  displayName: string | null;
  role: Role;
}

/**
 * One row on the page. Likes, reposts, plays and follows of the same thing
 * on the same day are one row — "Ana and 3 others liked your post" — as on
 * X; a reply, a mention or a quote is a post, and is drawn as one.
 */
export type NotificationItem =
  | {
      key: string;
      kind: "like" | "repost" | "play" | "follow";
      at: Date;
      unread: boolean;
      /** Newest first, at most six. Always empty on a play — see getNotifications. */
      actors: Actor[];
      total: number;
      /** like / repost: your post, as a line of its text. */
      post?: { id: string; body: string; isParlay: boolean; isReply: boolean } | null;
      /** play: your parlay, and the post it was shared as. */
      parlay?: { title: string; postId: string | null } | null;
    }
  | { key: string; kind: PostKind; at: Date; unread: boolean; actors: Actor[]; total: 1; feedPost: FeedPost };

/** Kinds that are a post someone wrote — drawn as that post. */
type PostKind = "reply" | "mention" | "quote";
const isPostKind = (k: NotificationKind): k is PostKind => k === "reply" || k === "mention" || k === "quote";

export const NOTIFICATIONS_PAGE = 20;

interface GroupRow extends Record<string, unknown> {
  kind: NotificationKind;
  post_id: string | null;
  parlay_id: string | null;
  at: string;
  actor_ids: string[];
  n: number;
  unread: boolean;
}

/**
 * A page of notifications, newest first, grouped. `before` is the previous
 * page's last `at`, as Postgres printed it — kept as text so the
 * microseconds survive the round trip and nothing is skipped or repeated.
 */
export async function getNotifications(
  userId: string,
  tab: NotificationTab,
  before?: string,
): Promise<{ items: NotificationItem[]; next: string | null }> {
  const onlyMentions = tab === "mentions" ? sql`and kind in ('reply', 'mention')` : sql``;
  const cursor = before ? sql`having max(created_at) < ${before}::timestamptz` : sql``;
  const rows = (await db.execute<GroupRow>(sql`
    select kind, post_id, parlay_id,
      max(created_at)::text as at,
      (array_agg(actor_id order by created_at desc))[1:6] as actor_ids,
      count(*)::int as n,
      bool_or(read_at is null) as unread
    from ${notifications}
    where user_id = ${userId} ${onlyMentions}
    group by kind, post_id, parlay_id,
      case when kind in ('reply', 'mention', 'quote') then id end,
      date_trunc('day', created_at)
    ${cursor}
    order by max(created_at) desc
    limit ${NOTIFICATIONS_PAGE + 1}
  `)) as unknown as GroupRow[];

  const page = rows.slice(0, NOTIFICATIONS_PAGE);
  const next = rows.length > NOTIFICATIONS_PAGE ? page.at(-1)!.at : null;

  const actorIds = [...new Set(page.flatMap((r) => r.actor_ids))];
  const postIds = page.flatMap((r) => (r.post_id ? [r.post_id] : []));
  const parlayIds = page.flatMap((r) => (r.kind === "play" && r.parlay_id ? [r.parlay_id] : []));

  const [actorRows, postMap, parlayViews, parlayPosts] = await Promise.all([
    actorIds.length
      ? db
          .select({ id: users.id, username: users.username, displayName: users.displayName, role: users.role })
          .from(users)
          .where(inArray(users.id, actorIds))
      : Promise.resolve([] as Actor[]),
    getPostsByIds(postIds, userId),
    parlayIds.length ? getParlaysByIds(parlayIds) : Promise.resolve([]),
    parlayIds.length
      ? db.select({ id: posts.id, parlayId: posts.parlayId }).from(posts).where(inArray(posts.parlayId, parlayIds))
      : Promise.resolve([]),
  ]);
  const actors = new Map(actorRows.map((a) => [a.id, a]));
  // Replies and mentions are drawn as posts, so they get their attachments.
  const shown = await withAttachments(
    page.filter((r) => isPostKind(r.kind)).flatMap((r) => (r.post_id && postMap.get(r.post_id) ? [postMap.get(r.post_id)!] : [])),
    userId,
  );
  const full = new Map(shown.map((p) => [p.id, p]));
  const parlayView = new Map(parlayViews.map((p) => [p.id, p]));
  const parlayPost = new Map(parlayPosts.map((p) => [p.parlayId, p.id]));

  const items: NotificationItem[] = [];
  for (const r of page) {
    // Who played your parlay is theirs to keep: the privacy policy promises
    // other testers see totals only. So a play is a count, never names.
    const who = r.kind === "play" ? [] : r.actor_ids.flatMap((id) => (actors.has(id) ? [actors.get(id)!] : []));
    if (who.length === 0 && r.kind !== "play") continue;
    const base = { key: `${r.kind}:${r.post_id ?? r.parlay_id ?? ""}:${r.at}`, at: new Date(r.at), unread: r.unread, actors: who };
    if (isPostKind(r.kind)) {
      const feedPost = r.post_id ? full.get(r.post_id) : undefined;
      if (feedPost) items.push({ ...base, kind: r.kind, total: 1, feedPost });
      continue;
    }
    const target = r.post_id ? postMap.get(r.post_id) : undefined;
    const pv = r.parlay_id ? parlayView.get(r.parlay_id) : undefined;
    items.push({
      ...base,
      kind: r.kind,
      total: r.n,
      post: target ? { id: target.id, body: target.body, isParlay: target.parlayId !== null, isReply: target.parentId !== null } : null,
      parlay: pv ? { title: pv.title ?? `${pv.legs.length}-leg parlay`, postId: parlayPost.get(pv.id) ?? null } : null,
    });
  }
  return { items, next };
}
