import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";
import { getAuth } from "@/lib/auth";
import { getFollowingCount, getWhoToFollow } from "@/lib/social";
import { forYouCursor, getHomeFollowing, getHomeForYou } from "@/lib/home-feed";
import { Composer } from "@/components/social/composer";
import { EmptyFeed, FeedList, FeedTabs } from "@/components/social/feed";
import { displayNameOf } from "@/components/social/identity";
import { WhoToFollow } from "@/components/social/user-row";
import { SocialShell } from "@/components/social/social-shell";
import { LoadMore } from "@/components/load-more";
import { loadHomeAction } from "@/app/actions/feeds";

export const metadata: Metadata = {
  title: "Home",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type Tab = "for-you" | "following";

/**
 * The activity page. Two feeds, as on X:
 *
 *   For you   — everything recent, ranked by engagement (getHomeForYou). The
 *               landing tab for everyone, as on X.
 *   Following — the accounts you follow, newest first. Only via ?tab=following.
 *
 * Both carry replies and shared Community parlays as well as posts — see
 * lib/home-feed.ts for how parlays page alongside them.
 *
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; before?: string; page?: string; welcome?: string }>;
}) {
  const [auth, params] = await Promise.all([getAuth(), searchParams]);
  if (!auth) redirect("/login?next=/home");
  const viewerId = auth.user.id;

  const followingCount = await getFollowingCount(viewerId);
  const tab: Tab = params.tab === "following" ? "following" : "for-you";

  const pageIndex = Math.max(0, Math.min(50, Number.parseInt(params.page ?? "0", 10) || 0));
  const before = params.before && /^[0-9a-f-]{36}$/i.test(params.before) ? params.before : undefined;

  const [feed, suggestions] = await Promise.all([
    tab === "following" ? getHomeFollowing(viewerId, before) : getHomeForYou(viewerId, pageIndex),
    getWhoToFollow(viewerId, 5),
  ]);

  // The cursor for infinite scroll: the oldest post's id on Following; on the
  // ranked For you, the next page number and the moment this page was ranked
  // at, so every later page is ranked at that same moment.
  const next =
    "nextCursor" in feed
      ? feed.nextCursor
      : feed.nextPage !== null
        ? forYouCursor(feed.nextPage, feed.asOf)
        : null;

  const firstPage = !before && pageIndex === 0;
  const viewerName = displayNameOf(auth.user);

  return (
    <SocialShell>
      {/* Once, straight after onboarding: where they landed, and where the picks are. */}
      {params.welcome === "1" && (
        <div role="status" className="m-4 rounded-lg border border-brand/25 bg-brand/5 px-4 py-3 text-sm text-brand">
          Account created — welcome in. Every game bet and player prop on the board is free
          during our beta.{" "}
          <Link href="/picks" className="font-semibold underline-offset-2 hover:underline">
            See the board →
          </Link>
        </div>
      )}
      <h1 className="sr-only">Home</h1>
      <FeedTabs
        sticky
        active={tab}
        tabs={[
          { key: "for-you", label: "For you", href: "/home?tab=for-you" },
          { key: "following", label: "Following", href: "/home?tab=following" },
        ]}
      />

      {/* Inline from sm up; on a phone the floating button opens it instead. */}
      {firstPage && (
        <div className="hidden sm:block">
          <Composer viewerName={viewerName} id="compose" />
        </div>
      )}

      {/* Follows nobody: say why they're seeing what they're seeing, and
          hand them the way out right here — the side rail is hidden on a
          phone, which is where most testers are. */}
      {tab === "for-you" && followingCount === 0 && firstPage && (
        <div className="border-b border-border px-4 py-3">
          <p className="flex items-start gap-2 text-sm text-fg-muted">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
            <span>
              You&apos;re seeing the most talked-about posts across oobee. Follow a few
              people and your Following tab fills up with theirs.
            </span>
          </p>
          {suggestions.length > 0 && (
            <div className="mt-3 lg:hidden">
              <WhoToFollow users={suggestions.slice(0, 3)} viewerId={viewerId} title="Start here" />
            </div>
          )}
        </div>
      )}

      <FeedList
        items={feed.items}
        viewerId={viewerId}
        isAdmin={auth.isAdmin}
        more={<LoadMore key={tab} next={next} load={loadHomeAction.bind(null, tab)} />}
        empty={
          tab === "following" ? (
            followingCount === 0 ? (
              <>
                <EmptyFeed title="Your Following feed is empty">
                  Follow people to see their posts here, newest first. Until then, For
                  you has what everyone&apos;s talking about.
                </EmptyFeed>
                <div className="px-4 pb-6">
                  <WhoToFollow users={suggestions} viewerId={viewerId} />
                </div>
              </>
            ) : (
              <EmptyFeed title={firstPage ? "Nothing here yet" : "You're all caught up"}>
                {firstPage
                  ? "The people you follow haven't posted yet. Say something yourself — it shows up here too."
                  : "That's everything from the people you follow."}
              </EmptyFeed>
            )
          ) : (
            <EmptyFeed title={firstPage ? "Quiet in here" : "You're all caught up"}>
              {firstPage ? "Nobody has posted yet. Be the first — what's your play today?" : null}
            </EmptyFeed>
          )
        }
      />
    </SocialShell>
  );
}
