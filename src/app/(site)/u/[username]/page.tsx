import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { getAuth } from "@/lib/auth";
import { after } from "next/server";
import { getProfile, getProfilePosts } from "@/lib/social";
import { refreshResults } from "@/lib/odds/sync";
import { StatsPanel } from "@/components/profile/stats-panel";
import { compactCount } from "@/lib/social-rules";
import { LocalTime } from "@/components/local-time";
import { appUrl } from "@/lib/site";
import { EmptyFeed, FeedList, FeedTabs } from "@/components/social/feed";
import { Avatar, TeamBadge, displayNameOf } from "@/components/social/identity";
import { FollowButton } from "@/components/social/follow-button";
import { PostBody } from "@/components/social/post-body";
import { Button } from "@/components/ui/button";
import { SocialShell } from "@/components/social/social-shell";
import { ComposeDialog } from "@/components/social/compose-dialog";
import { LoadMore } from "@/components/load-more";
import { loadProfileAction } from "@/app/actions/feeds";
import { postItems } from "@/lib/home-feed";

export const dynamic = "force-dynamic";

type Params = Promise<{ username: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { username } = await params;
  const profile = await getProfile(decodeURIComponent(username), null);
  if (!profile) return { title: "Profile not found" };
  const title = `${displayNameOf(profile)} (@${profile.username})`;
  const description = profile.bio ?? `${title} on oobee bets.`;
  return {
    title,
    description,
    alternates: { canonical: appUrl(`/u/${profile.username}`) },
    openGraph: { title, description, type: "profile", url: appUrl(`/u/${profile.username}`) },
    twitter: { card: "summary", title, description },
  };
}

type Tab = "posts" | "stats";

/**
 * A profile, laid out like X's: who they are, how many follow them and whom
 * they follow, then two tabs — Posts (posts and replies together, newest
 * first; a reply under the post it answers) and, on your own profile only,
 * Stats: your record, which used to be its own page (see StatsPanel).
 */
export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<{ tab?: string; before?: string; view?: string; show?: string }>;
}) {
  const [{ username }, query, auth] = await Promise.all([params, searchParams, getAuth()]);
  // Signed out, only the landing page, About and the legal pages are open.
  if (!auth) redirect(`/login?next=/u/${encodeURIComponent(username)}`);
  const viewerId = auth.user.id;

  const profile = await getProfile(decodeURIComponent(username), viewerId);
  if (!profile) notFound();

  const self = viewerId === profile.id;
  // Stats is yours alone; on anyone else's profile the tab doesn't exist.
  const tab: Tab = self && query.tab === "stats" ? "stats" : "posts";
  const before = query.before && /^[0-9a-f-]{36}$/i.test(query.before) ? query.before : undefined;
  const feed = tab === "posts" ? await getProfilePosts(profile.id, viewerId, before) : null;
  // Grade anything that has finished — after the response, so nobody waits
  // on the odds provider to see their record (see refreshResults).
  if (tab === "stats") after(refreshResults);

  const name = displayNameOf(profile);
  const base = `/u/${profile.username}`;
  const tabs = [
    { key: "posts", label: "Posts", href: base },
    ...(self ? [{ key: "stats", label: "Stats", href: `${base}?tab=stats` }] : []),
  ];

  return (
    <SocialShell>
      {/* ------------------------------------------------------- header */}
      <div className="h-28 border-b border-border bg-gradient-to-br from-brand/25 via-surface-2 to-surface sm:h-36" />
      <div className="px-4 pb-3">
        <div className="flex items-end justify-between">
          <Avatar name={name} size="lg" className="-mt-10 border-black bg-surface-2 sm:-mt-12" />
          <div className="pt-3">
            {self ? (
              <Button variant="outline" size="sm" className="rounded-full" asChild>
                <Link href="/account">Edit profile</Link>
              </Button>
            ) : (
              <FollowButton
                userId={profile.id}
                username={profile.username}
                following={profile.viewerFollows}
                signedIn={Boolean(auth)}
              />
            )}
          </div>
        </div>

        <h1 className="mt-3 flex items-center gap-1.5 text-xl font-bold tracking-tight">
          {name}
          <TeamBadge role={profile.role} className="size-5" />
        </h1>
        <p className="flex items-center gap-2 text-sm text-fg-subtle">
          @{profile.username}
          {profile.followsViewer && (
            <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[0.6875rem] text-fg-muted">
              Follows you
            </span>
          )}
        </p>

        {profile.bio && <PostBody body={profile.bio} className="mt-3 text-[0.9375rem]" />}

        <p className="mt-3 flex items-center gap-1.5 text-sm text-fg-subtle">
          <CalendarDays className="size-4" aria-hidden="true" />
          Joined <LocalTime at={profile.createdAt} format="date" />
        </p>

        <div className="mt-3 flex gap-5 text-sm">
          <Link href={`${base}/following`} className="hover:underline">
            <span className="num font-semibold text-fg">{compactCount(profile.following)}</span>{" "}
            <span className="text-fg-subtle">Following</span>
          </Link>
          <Link href={`${base}/followers`} className="hover:underline">
            <span className="num font-semibold text-fg">{compactCount(profile.followers)}</span>{" "}
            <span className="text-fg-subtle">{profile.followers === 1 ? "Follower" : "Followers"}</span>
          </Link>
        </div>
      </div>

      {/* One tab needs no strip: someone else's profile is just their posts. */}
      {tabs.length > 1 ? (
        <FeedTabs sticky active={tab} tabs={tabs} label="Profile" />
      ) : (
        <h2 className="border-b border-border px-4 pb-3 text-[0.9375rem] font-bold">Posts</h2>
      )}

      {tab === "stats" ? (
        <StatsPanel viewerId={viewerId} view={query.view} show={query.show} base={`${base}?tab=stats`} />
      ) : (
      <FeedList
        items={await postItems(feed!.posts, viewerId)}
        viewerId={viewerId}
        isAdmin={auth?.isAdmin ?? false}
        more={
          <LoadMore key={profile.id} next={feed!.nextCursor} load={loadProfileAction.bind(null, profile.id)} />
        }
        empty={
          <EmptyFeed
            title={
              before
                ? "That's everything"
                : self
                  ? "You haven't posted yet"
                  : `@${profile.username} hasn't posted yet`
            }
          >
            {self && !before ? (
              <ComposeDialog viewerName={displayNameOf(auth.user)}>
                <button type="button" className="text-brand hover:underline">
                  Write your first post
                </button>
              </ComposeDialog>
            ) : null}
          </EmptyFeed>
        }
      />
      )}
    </SocialShell>
  );
}
