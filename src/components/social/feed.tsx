import { Fragment } from "react";
import Link from "next/link";
import type { FeedItem } from "@/lib/home-feed";
import { PostCard } from "@/components/social/post-card";
import { ParlayPost, hasParlay } from "@/components/social/parlay-row";
import { ParlayCard } from "@/components/parlay-card";
import { cn } from "@/lib/utils";

/** The tab strip under a page title: For you / Following, Posts / Replies / Likes. */
export function FeedTabs({
  tabs,
  active,
  sticky = false,
}: {
  tabs: Array<{ key: string; label: string; href: string }>;
  active: string;
  sticky?: boolean;
}) {
  return (
    <nav
      aria-label="Feed"
      className={cn(
        "flex border-b border-border bg-black/80 backdrop-blur-xl",
        sticky && "sticky top-[calc(3.5rem+1px+var(--spacing-safe-top)-var(--chrome-hide,0px))] z-30 sm:top-0",
      )}
    >
      {tabs.map((tab) => {
        const on = tab.key === active;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={on ? "page" : undefined}
            className={cn(
              "flex flex-1 justify-center py-3.5 text-sm transition-colors hover:bg-surface/60",
              on ? "font-semibold text-fg" : "text-fg-muted",
            )}
          >
            <span className="relative">
              {tab.label}
              {on && (
                <span className="absolute -bottom-3.5 left-0 right-0 h-1 rounded-full bg-brand" aria-hidden="true" />
              )}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

/** A timeline of posts — shared parlays among them, drawn as their tickets. */
export function FeedList({
  items,
  viewerId,
  isAdmin,
  more,
  empty,
}: {
  items: FeedItem[];
  viewerId: string | null;
  isAdmin: boolean;
  /** What follows the list — the infinite-scroll loader, when there is more. */
  more?: React.ReactNode;
  empty?: React.ReactNode;
}) {
  if (items.length === 0) return <>{empty}</>;
  return (
    <div>
      {items.map((item) => {
        const { post, parent, repostedBy } = item;
        // A shared parlay: the ticket, with its post's actions under it.
        if (hasParlay(post) && !parent) {
          return <ParlayPost key={item.key} post={post} viewerId={viewerId} repostedBy={repostedBy} />;
        }
        // A reply comes with the post it answers, joined by the thread line,
        // as on X — so it reads as half of a conversation you can see. A
        // repost line goes above the pair, not between.
        return (
          <Fragment key={item.key}>
            {parent && (
              <PostCard
                post={parent}
                viewerId={viewerId}
                isAdmin={isAdmin}
                variant="ancestor"
                repostedBy={repostedBy}
                attachment={hasParlay(parent) ? <ParlayCard parlay={parent.parlay} /> : undefined}
              />
            )}
            <PostCard
              post={post}
              viewerId={viewerId}
              isAdmin={isAdmin}
              showReplyTo={!parent}
              threadAbove={Boolean(parent)}
              repostedBy={parent ? undefined : repostedBy}
              attachment={hasParlay(post) ? <ParlayCard parlay={post.parlay} /> : undefined}
            />
          </Fragment>
        );
      })}
      {more}
    </div>
  );
}

export function EmptyFeed({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="px-6 py-14 text-center">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {children && <div className="mx-auto mt-2 max-w-sm text-sm text-fg-muted">{children}</div>}
    </div>
  );
}
