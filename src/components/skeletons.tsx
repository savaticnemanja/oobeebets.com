import { SocialShell } from "@/components/social/social-shell";
import { cn } from "@/lib/utils";

/**
 * What a page looks like while it loads — the loading.tsx of Home, Picks,
 * Community and Stats. Next shows these the moment a link is tapped, so the
 * tap answers at once instead of the old page sitting there until the new one
 * arrives. Grey shapes where the menus, posts and picks will be, in the same
 * column and at the same heights, so nothing jumps when the real page lands.
 */

/** A grey bar or block standing in for content. */
function Bone({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("block rounded-full bg-surface-2 motion-safe:animate-pulse", className)} />;
}

/** The page's tab strip (FeedTabs, Picks' tabs): 3.0625rem with its border. */
function TabsBone({ count }: { count: number }) {
  return (
    <div className="flex h-[3.0625rem] border-b border-border">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex flex-1 items-center justify-center">
          <Bone className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

/** The sport pills row (SportPills): 3.5rem with its border. */
function PillsBone() {
  return (
    <div className="flex h-14 items-center gap-2 overflow-hidden border-b border-border px-4">
      {["w-12", "w-16", "w-16", "w-16", "w-16", "w-20", "w-[4.5rem]"].map((w, i) => (
        <Bone key={i} className={cn("h-8 shrink-0", w)} />
      ))}
    </div>
  );
}

/** A post: avatar, name line, two lines of text. */
function PostBone({ lines = 2 }: { lines?: number }) {
  return (
    <div className="flex gap-3 border-b border-border px-4 py-3">
      <Bone className="size-10 shrink-0" />
      <div className="min-w-0 flex-1 space-y-2.5 pt-1">
        <Bone className="h-3 w-40" />
        {Array.from({ length: lines }, (_, i) => (
          <Bone key={i} className={cn("h-3", i === lines - 1 ? "w-2/3" : "w-full")} />
        ))}
      </div>
    </div>
  );
}

/** A day heading on the board. */
function DayBone() {
  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
      <Bone className="h-4 w-32" />
      <Bone className="h-3 w-20" />
    </div>
  );
}

/** A pick row: matchup, the bet, then the odds line. */
function PickBone() {
  return (
    <div className="space-y-2.5 border-b border-border px-4 py-4">
      <Bone className="h-3 w-48" />
      <Bone className="h-4 w-3/4" />
      <Bone className="h-3 w-28" />
    </div>
  );
}

function Loading({ children }: { children: React.ReactNode }) {
  return (
    <SocialShell>
      <div role="status">
        <span className="sr-only">Loading…</span>
        {children}
      </div>
    </SocialShell>
  );
}

export function FeedSkeleton() {
  return (
    <Loading>
      <TabsBone count={2} />
      {[2, 3, 1, 2, 3, 2].map((lines, i) => (
        <PostBone key={i} lines={lines} />
      ))}
    </Loading>
  );
}

export function BoardSkeleton({ tabs }: { tabs: boolean }) {
  return (
    <Loading>
      {tabs && <TabsBone count={3} />}
      <PillsBone />
      <DayBone />
      {Array.from({ length: 5 }, (_, i) => (
        <PickBone key={i} />
      ))}
    </Loading>
  );
}

/** A post's own page: the back row, the post at full size, the reply box, replies. */
export function PostPageSkeleton() {
  return (
    <Loading>
      <div className="flex items-center gap-4 px-4 py-2.5">
        <Bone className="size-9 rounded-full" />
        <Bone className="h-4 w-16" />
      </div>
      <div className="border-b border-border px-4 pb-3 pt-2">
        <div className="flex items-center gap-3">
          <Bone className="size-10 shrink-0 rounded-full" />
          <div className="space-y-1.5">
            <Bone className="h-3 w-28" />
            <Bone className="h-2.5 w-20" />
          </div>
        </div>
        <div className="mt-4 space-y-2.5">
          <Bone className="h-4 w-full" />
          <Bone className="h-4 w-4/5" />
        </div>
        <Bone className="mt-5 h-3 w-32" />
      </div>
      <PostBone lines={1} />
      {[2, 1, 2].map((lines, i) => (
        <PostBone key={i} lines={lines} />
      ))}
    </Loading>
  );
}

/** A profile: banner, avatar, name, counts, the tabs, then posts. */
export function ProfileSkeleton() {
  return (
    <Loading>
      <div className="h-28 border-b border-border bg-surface/40 sm:h-36" />
      <div className="px-4 pb-4">
        <Bone className="-mt-10 size-20 rounded-full border-4 border-black sm:-mt-12" />
        <Bone className="mt-3 h-5 w-40" />
        <Bone className="mt-2 h-3 w-24" />
        <Bone className="mt-4 h-3 w-3/4" />
        <Bone className="mt-4 h-3 w-48" />
      </div>
      <TabsBone count={2} />
      {[2, 1, 3, 2].map((lines, i) => (
        <PostBone key={i} lines={lines} />
      ))}
    </Loading>
  );
}

/** Notifications: the title, the two tabs, rows of faces and a line. */
export function NotificationsSkeleton() {
  return (
    <Loading>
      <Bone className="mx-4 mb-3 mt-4 h-5 w-32" />
      <TabsBone count={2} />
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex gap-3 border-b border-border px-4 py-3">
          <div className="flex w-10 shrink-0 justify-end">
            <Bone className="size-7 rounded-full" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex gap-1">
              {Array.from({ length: (i % 3) + 1 }, (_, j) => (
                <Bone key={j} className="size-8 rounded-full" />
              ))}
            </div>
            <Bone className="mt-3 h-3 w-3/4" />
            <Bone className="mt-2 h-2.5 w-1/2" />
          </div>
        </div>
      ))}
    </Loading>
  );
}

/** The parlay builder: title, search, then day headings and game cards. */
export function BuilderSkeleton() {
  return (
    <Loading>
      <div className="flex items-center gap-3 px-2 py-2">
        <Bone className="size-9 rounded-full" />
        <Bone className="h-5 w-36" />
      </div>
      <div className="px-4 pt-2">
        <Bone className="h-3 w-full" />
        <Bone className="mt-2 h-3 w-2/3" />
        <Bone className="mt-4 h-11 w-full rounded-full" />
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="mt-4">
            <Bone className="h-3.5 w-32" />
            <Bone className="mt-3 h-40 w-full rounded-2xl" />
          </div>
        ))}
      </div>
    </Loading>
  );
}

export function PlayersSkeleton() {
  return (
    <Loading>
      <TabsBone count={2} />
      <div className="border-b border-border px-4 pb-2.5 pt-3">
        <Bone className="h-10 w-full rounded-full" />
        <div className="mt-2.5 flex items-center gap-2">
          {["w-20", "w-40", "w-32"].map((w, i) => (
            <Bone key={i} className={cn("h-8 shrink-0 rounded-full", w)} />
          ))}
        </div>
      </div>
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-border px-4 py-3">
          <Bone className="h-3 w-4 shrink-0" />
          <div className="w-36 shrink-0 space-y-1.5">
            <Bone className="h-3 w-28" />
            <Bone className="h-2.5 w-16" />
          </div>
          {Array.from({ length: 4 }, (_, j) => (
            <Bone key={j} className="ml-auto h-3 w-8 shrink-0" />
          ))}
        </div>
      ))}
    </Loading>
  );
}
