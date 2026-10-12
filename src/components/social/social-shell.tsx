import { WhoToFollow } from "@/components/social/user-row";
import { getWhoToFollow, type UserListItem } from "@/lib/social";

/**
 * The layout every social page shares: the feed column on the left, aligned
 * with the header's logo, and the side rail on the right from `lg` up. Home,
 * profiles, posts and follower lists used to centre their own columns at
 * different widths, so the feed jumped sideways between pages.
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
    <div className="mx-auto grid w-full max-w-6xl gap-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-h-dvh min-w-0 border-border sm:border-x">{children}</div>

      <aside className="hidden lg:block">
        <div className="sticky top-[calc(4.5rem+var(--spacing-safe-top))] space-y-4 pt-4">
          <WhoToFollow users={rail} viewerId={viewerId} />
        </div>
      </aside>
    </div>
  );
}
