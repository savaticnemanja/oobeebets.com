import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { getAuth } from "@/lib/auth";
import { getNotifications, markAllRead, type NotificationTab } from "@/lib/notifications";
import { EmptyFeed, FeedTabs } from "@/components/social/feed";
import { NotificationList } from "@/components/social/notification-list";
import { SocialShell } from "@/components/social/social-shell";
import { LoadMore } from "@/components/load-more";
import { loadNotificationsAction } from "@/app/actions/feeds";

export const metadata: Metadata = {
  title: "Notifications",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Who liked, reposted, replied, mentioned, followed or played — as on X,
 * with Mentions (replies and @mentions) on a tab of its own. Opening the
 * page reads everything on it: what was new is tinted this once, then marked
 * read once the page has gone out, which clears the badge in the nav.
 */
export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const [auth, params] = await Promise.all([getAuth(), searchParams]);
  if (!auth) redirect("/login?next=/notifications");
  const tab: NotificationTab = params.tab === "mentions" ? "mentions" : "all";

  const renderedAt = new Date();
  const { items, next } = await getNotifications(auth.user.id, tab);
  after(() => markAllRead(auth.user.id, renderedAt));

  return (
    <SocialShell>
      <h1 className="px-4 pb-1 pt-3 text-xl font-bold tracking-tight">Notifications</h1>
      <FeedTabs
        sticky
        label="Notifications"
        active={tab}
        tabs={[
          { key: "all", label: "All", href: "/notifications" },
          { key: "mentions", label: "Mentions", href: "/notifications?tab=mentions" },
        ]}
      />
      <NotificationList
        items={items}
        viewer={{ id: auth.user.id, username: auth.user.username, isAdmin: auth.isAdmin }}
        more={<LoadMore key={tab} next={next} load={loadNotificationsAction.bind(null, tab)} />}
        empty={
          tab === "mentions" ? (
            <EmptyFeed title="No mentions yet">
              When someone replies to you or @mentions you, you&apos;ll find it here.
            </EmptyFeed>
          ) : (
            <EmptyFeed title="Nothing to see here — yet">
              Likes, reposts, replies, mentions, new followers and plays of your parlays all show up here.
            </EmptyFeed>
          )
        }
      />
    </SocialShell>
  );
}
