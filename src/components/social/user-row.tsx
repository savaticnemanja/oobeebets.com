import Link from "next/link";
import type { UserListItem } from "@/lib/social";
import { Avatar, NameLine, displayNameOf } from "@/components/social/identity";
import { FollowButton } from "@/components/social/follow-button";

/** One account in a list: followers, following, who to follow. */
export function UserRow({
  user,
  viewerId,
  showBio = true,
}: {
  user: UserListItem;
  viewerId: string | null;
  showBio?: boolean;
}) {
  return (
    <div className="flex gap-3 px-4 py-3 transition-colors hover:bg-surface/60">
      <Link href={`/u/${user.username}`} aria-label={displayNameOf(user)}>
        <Avatar name={displayNameOf(user)} />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <NameLine user={user} stacked />
            {user.followsViewer && (
              <span className="mt-0.5 inline-block rounded bg-surface-2 px-1.5 py-0.5 text-[0.6875rem] text-fg-muted">
                Follows you
              </span>
            )}
          </div>
          {viewerId && viewerId !== user.id && (
            <FollowButton
              className="shrink-0"
              userId={user.id}
              username={user.username}
              following={user.viewerFollows}
              signedIn
            />
          )}
        </div>
        {showBio && user.bio && <p className="mt-1 line-clamp-2 text-sm text-fg-muted">{user.bio}</p>}
      </div>
    </div>
  );
}

/** The "Who to follow" box on the side rail and the empty Following tab. */
export function WhoToFollow({
  users,
  viewerId,
  title = "Who to follow",
}: {
  users: UserListItem[];
  viewerId: string | null;
  title?: string;
}) {
  if (users.length === 0) return null;
  return (
    <section className="card-hairline overflow-hidden" aria-labelledby="who-to-follow">
      <h2 id="who-to-follow" className="px-4 pb-1 pt-3 text-lg font-semibold tracking-tight">
        {title}
      </h2>
      {users.map((u) => (
        <UserRow key={u.id} user={u} viewerId={viewerId} showBio={false} />
      ))}
    </section>
  );
}
