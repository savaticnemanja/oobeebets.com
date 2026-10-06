import Link from "next/link";
import type { FeedPost } from "@/lib/social";
import { PostCard } from "@/components/social/post-card";
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
        sticky && "sticky top-[calc(3.5rem+var(--spacing-safe-top))] z-30",
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

export function FeedList({
  posts,
  viewerId,
  isAdmin,
  moreHref,
  empty,
}: {
  posts: FeedPost[];
  viewerId: string | null;
  isAdmin: boolean;
  /** Link to the next page, when there is one. */
  moreHref?: string | null;
  empty?: React.ReactNode;
}) {
  if (posts.length === 0) return <>{empty}</>;
  return (
    <div>
      {posts.map((p) => (
        <PostCard key={p.id} post={p} viewerId={viewerId} isAdmin={isAdmin} />
      ))}
      {moreHref && (
        <Link
          href={moreHref}
          scroll={false}
          className="block py-4 text-center text-sm text-brand transition-colors hover:bg-surface/60"
        >
          Show older posts
        </Link>
      )}
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
