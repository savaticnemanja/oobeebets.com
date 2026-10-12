import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { getAuth } from "@/lib/auth";
import { getProfile, getProfilePosts, type ProfileTab } from "@/lib/social";
import { compactCount } from "@/lib/social-rules";
import { formatDate } from "@/lib/i18n/format";
import { appUrl } from "@/lib/site";
import { EmptyFeed, FeedList, FeedTabs } from "@/components/social/feed";
import { Avatar, TeamBadge, displayNameOf } from "@/components/social/identity";
import { FollowButton } from "@/components/social/follow-button";
import { PostBody } from "@/components/social/post-body";
import { Button } from "@/components/ui/button";
import { SocialShell } from "@/components/social/social-shell";
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

const TABS: Array<{ key: ProfileTab; label: string }> = [
  { key: "posts", label: "Posts" },
  { key: "replies", label: "Replies" },
  { key: "likes", label: "Likes" },
];

/**
 * A public profile, laid out like X's: who they are, how many follow them and
 * whom they follow, and their posts. Readable signed out — liking, replying
 * and following ask you to sign in first.
 */
export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<{ tab?: string; before?: string }>;
}) {
  const [{ username }, query, auth] = await Promise.all([params, searchParams, getAuth()]);
  const viewerId = auth?.user.id ?? null;

  const profile = await getProfile(decodeURIComponent(username), viewerId);
  if (!profile) notFound();

  const tab: ProfileTab = TABS.some((t) => t.key === query.tab) ? (query.tab as ProfileTab) : "posts";
  const before = query.before && /^[0-9a-f-]{36}$/i.test(query.before) ? query.before : undefined;
  const feed = await getProfilePosts(profile.id, viewerId, tab, before);

  const self = viewerId === profile.id;
  const name = displayNameOf(profile);
  const base = `/u/${profile.username}`;

  return (
    <SocialShell viewerId={viewerId}>
      {/* ------------------------------------------------------- header */}
      <div className="h-28 border-b border-border bg-gradient-to-br from-brand/25 via-surface-2 to-surface sm:h-36" />
      <div className="px-4 pb-3">
        <div className="flex items-end justify-between">
          <Avatar name={name} size="lg" className="-mt-10 border-black bg-surface-2 sm:-mt-12" />
          <div className="pt-3">
            {self ? (
              <Button variant="outline" size="sm" className="rounded-full" asChild>
                <Link href="/account#profile">Edit profile</Link>
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
          Joined {formatDate(profile.createdAt)}
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

      <FeedTabs
        active={tab}
        tabs={TABS.map((t) => ({ ...t, href: t.key === "posts" ? base : `${base}?tab=${t.key}` }))}
      />

      <FeedList
        items={postItems(feed.posts)}
        viewerId={viewerId}
        isAdmin={auth?.isAdmin ?? false}
        moreHref={feed.nextCursor && `${base}?tab=${tab}&before=${feed.nextCursor}`}
        empty={
          <EmptyFeed
            title={
              before
                ? "That's everything"
                : tab === "posts"
                  ? self ? "You haven't posted yet" : `@${profile.username} hasn't posted yet`
                  : tab === "replies"
                    ? "No replies yet"
                    : "No likes yet"
            }
          >
            {self && tab === "posts" && !before ? (
              <Link href="/home#compose" className="text-brand hover:underline">
                Write your first post
              </Link>
            ) : null}
          </EmptyFeed>
        }
      />
    </SocialShell>
  );
}
