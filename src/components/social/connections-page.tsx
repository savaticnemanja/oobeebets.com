import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getAuth } from "@/lib/auth";
import { getProfile, listConnections } from "@/lib/social";
import { EmptyFeed, FeedTabs } from "@/components/social/feed";
import { displayNameOf } from "@/components/social/identity";
import { UserRow } from "@/components/social/user-row";
import { SocialShell } from "@/components/social/social-shell";

/** /u/<username>/followers and /u/<username>/following — one page, two directions. */
export async function ConnectionsPage({
  username,
  direction,
}: {
  username: string;
  direction: "followers" | "following";
}) {
  const auth = await getAuth();
  const viewerId = auth?.user.id ?? null;
  const profile = await getProfile(decodeURIComponent(username), viewerId);
  if (!profile) notFound();

  const people = await listConnections(profile.id, direction, viewerId);
  const base = `/u/${profile.username}`;
  const self = viewerId === profile.id;

  return (
    <SocialShell viewerId={viewerId}>
      <div className="flex items-center gap-4 px-4 py-2.5">
        <Link
          href={base}
          aria-label="Back to profile"
          className="grid size-9 place-items-center rounded-full transition-colors hover:bg-surface-2"
        >
          <ArrowLeft className="size-5" aria-hidden="true" />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold leading-tight">{displayNameOf(profile)}</h1>
          <p className="text-sm text-fg-subtle">@{profile.username}</p>
        </div>
      </div>
      <FeedTabs
        active={direction}
        tabs={[
          { key: "followers", label: "Followers", href: `${base}/followers` },
          { key: "following", label: "Following", href: `${base}/following` },
        ]}
      />
      {people.length === 0 ? (
        <EmptyFeed
          title={
            direction === "followers"
              ? self ? "You don't have any followers yet" : `@${profile.username} has no followers yet`
              : self ? "You aren't following anyone yet" : `@${profile.username} isn't following anyone yet`
          }
        >
          {self && direction === "following" ? (
            <Link href="/home?tab=for-you" className="text-brand hover:underline">
              Find people on For you
            </Link>
          ) : null}
        </EmptyFeed>
      ) : (
        people.map((u) => <UserRow key={u.id} user={u} viewerId={viewerId} />)
      )}
    </SocialShell>
  );
}
