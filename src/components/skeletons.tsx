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

export function StatsSkeleton() {
  return (
    <Loading>
      <TabsBone count={3} />
      <div className="grid grid-cols-2 border-b border-border">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className={cn("space-y-2.5 px-4 py-4", i % 2 === 0 && "border-r border-border", i < 2 && "border-b border-border")}>
            <Bone className="h-3 w-20" />
            <Bone className="h-6 w-16" />
            <Bone className="h-3 w-24" />
          </div>
        ))}
      </div>
      <div className="space-y-3 px-4 py-4">
        <Bone className="h-4 w-44" />
        <Bone className="h-3 w-full" />
        <Bone className="h-3 w-5/6" />
        <Bone className="mt-4 h-24 w-full rounded-lg" />
      </div>
    </Loading>
  );
}

/** Players: pills, the table tabs, the filter row, then table rows. */
export function PlayersSkeleton() {
  return (
    <Loading>
      <PillsBone />
      <TabsBone count={2} />
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        {["w-32", "w-20", "w-24", "w-24"].map((w, i) => (
          <Bone key={i} className={cn("h-8 shrink-0", w)} />
        ))}
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
