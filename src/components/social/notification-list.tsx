import Link from "next/link";
import { CircleCheck, Heart, Repeat2, User } from "lucide-react";
import type { NotificationItem } from "@/lib/notifications";
import { LocalTime } from "@/components/local-time";
import { Avatar, displayNameOf } from "@/components/social/identity";
import { PostCard } from "@/components/social/post-card";
import { parlayParts } from "@/components/social/parlay-row";
import { cn } from "@/lib/utils";

const ICON = {
  like: { icon: Heart, className: "fill-current text-pink-500" },
  repost: { icon: Repeat2, className: "text-hit" },
  play: { icon: CircleCheck, className: "text-brand" },
  follow: { icon: User, className: "fill-current text-brand" },
} as const;

/**
 * The notifications page's rows, as on X. A reply or a mention is the post
 * itself, drawn like any other post. Likes, reposts, plays and follows are a
 * line each: their icon in the avatar column, the faces of who did it, then
 * "Ana and 3 others liked your post" and a line of the post. Unread rows are
 * tinted until the page has been seen.
 */
export function NotificationList({
  items,
  viewer,
  more,
  empty,
}: {
  items: NotificationItem[];
  viewer: { id: string; username: string; isAdmin: boolean };
  more?: React.ReactNode;
  empty?: React.ReactNode;
}) {
  if (items.length === 0) return <>{empty}</>;
  return (
    <div>
      {items.map((item) =>
        "feedPost" in item ? (
          <div key={item.key} className={cn(item.unread && "bg-brand/[0.04]")} data-notification={item.kind}>
            <PostCard post={item.feedPost} viewerId={viewer.id} isAdmin={viewer.isAdmin} {...parlayParts(item.feedPost, viewer.id)} />
          </div>
        ) : (
          <GroupRow key={item.key} item={item} viewerUsername={viewer.username} />
        ),
      )}
      {more}
    </div>
  );
}

function GroupRow({
  item,
  viewerUsername,
}: {
  item: Extract<NotificationItem, { kind: "like" | "repost" | "play" | "follow" }>;
  viewerUsername: string;
}) {
  const { icon: Icon, className } = ICON[item.kind];
  const [first] = item.actors;
  const others = item.total - 1;
  const names =
    others === 0 ? (
      <Name actor={first} />
    ) : others === 1 && item.actors[1] ? (
      <>
        <Name actor={first} /> and <Name actor={item.actors[1]} />
      </>
    ) : (
      <>
        <Name actor={first} /> and {others} others
      </>
    );

  const noun = item.post?.isParlay ? "your parlay" : item.post?.isReply ? "your reply" : "your post";
  const did = {
    like: `liked ${noun}`,
    repost: `reposted ${noun}`,
    play: "played your parlay",
    follow: "followed you",
  }[item.kind];

  const href =
    item.kind === "follow"
      ? item.total === 1
        ? `/u/${first.username}`
        : `/u/${viewerUsername}/followers`
      : item.kind === "play"
        ? item.parlay?.postId
          ? `/p/${item.parlay.postId}`
          : "/stats?tab=parlays"
        : item.post
          ? `/p/${item.post.id}`
          : "/home";

  const excerpt =
    item.kind === "play"
      ? item.parlay?.title
      : item.post
        ? item.post.body.trim() || (item.post.isParlay ? "Your parlay" : "")
        : null;

  return (
    <article
      data-notification={item.kind}
      className={cn(
        "relative flex gap-3 border-b border-border px-4 py-3 transition-colors hover:bg-surface/60",
        item.unread && "bg-brand/[0.04]",
      )}
    >
      {/* The whole row opens what it's about; the faces and names above it
          open their own profiles. */}
      <Link href={href} className="absolute inset-0" aria-label={`${displayNameOf(first)}${others ? ` and ${others} others` : ""} ${did}`} />
      <div className="flex w-10 shrink-0 justify-end">
        <Icon className={cn("size-7", className)} strokeWidth={1.75} aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex gap-1">
          {item.actors.map((a) => (
            <Link key={a.id} href={`/u/${a.username}`} aria-label={displayNameOf(a)} className="relative z-10">
              <Avatar name={displayNameOf(a)} size="sm" className="size-8" />
            </Link>
          ))}
        </div>
        <p className="mt-2 text-[0.9375rem] leading-snug text-fg">
          {names} {did} <span className="text-fg-subtle">·</span>{" "}
          <LocalTime at={item.at} format="ago" className="text-sm text-fg-subtle" />
        </p>
        {excerpt && <p className="mt-1 line-clamp-2 text-sm text-fg-subtle">{excerpt}</p>}
      </div>
    </article>
  );
}

function Name({ actor }: { actor: { username: string; displayName: string | null } }) {
  return (
    <Link href={`/u/${actor.username}`} className="relative z-10 font-semibold hover:underline">
      {displayNameOf(actor)}
    </Link>
  );
}
