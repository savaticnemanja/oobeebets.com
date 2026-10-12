import { WhoToFollow } from "@/components/social/user-row";
import { getWhoToFollow, type UserListItem } from "@/lib/social";

/**
 * The layout every social page shares, sized as on X: a 600px feed column
 * against the sidebar, and a 350px side rail from `lg` up. Home, profiles,
 * posts and follower lists all use it, so the column never moves between them.
 *
 * `suggestions` lets a page that already fetched them (Home shows a few inline
 * on a phone) skip the second query.
 */
export async function SocialShell({
  viewerId,
  suggestions,
  children,
}: {
  viewerId: string | null;
  suggestions?: UserListItem[];
  children: React.ReactNode;
}) {
  const rail = suggestions ?? (viewerId ? await getWhoToFollow(viewerId, 5) : []);

  return (
    <div className="flex w-full gap-8">
      <div className="min-h-dvh w-full min-w-0 border-border sm:max-w-[37.5rem] sm:border-x">{children}</div>

      <aside className="hidden w-[21.875rem] shrink-0 lg:block">
        <div className="sticky top-0 space-y-4 pt-3">
          <WhoToFollow users={rail} viewerId={viewerId} />
        </div>
      </aside>
    </div>
  );
}
