import Link from "next/link";
import { SPORT_FILTERS, type SportFilter } from "@/lib/board";
import { SPORT_EMOJI } from "@/components/pick-card";
import { ScrollActiveTab } from "@/components/ui/scroll-active-tab";
import { cn } from "@/lib/utils";

/**
 * The sport pills — All, NFL, NBA, MLB, NHL, Soccer, Tennis — on Picks, on
 * Community and on Players. They stick: under Picks' tab strip
 * (`below="tabs"`), straight under the phone's top bar on Community, which
 * has no tabs (`below="bar"`), or under the bar with a tab strip sticking
 * under *them*, on Players (`below="bar-tabs"`).
 * Fixed at 3.5rem with the border, since the day headings stick under them
 * and their offset is written in terms of it (board-days.tsx). On a phone the
 * menus slide away with the top bar (scroll-chrome.tsx's --chrome-p, times the
 * menus' own height) so only the day heading stays pinned.
 */
export function SportPills({
  active,
  hrefFor,
  below,
  actions,
  filters = SPORT_FILTERS,
  withAll = true,
}: {
  active: SportFilter | null;
  hrefFor: (key: string | null) => string;
  below: "tabs" | "bar" | "bar-tabs";
  /** Which sports to offer — Players only has tables for some. */
  filters?: readonly SportFilter[];
  /** Players has no "All": every sport's table has its own columns. */
  withAll?: boolean;
  /** Icons at the row's right end (Community's + and info) — outside the
   *  scrolling strip, so a tooltip's panel isn't clipped by it. */
  actions?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "sticky flex h-14 items-center border-b border-border bg-black/80 backdrop-blur-xl",
        below === "tabs"
          ? "top-[calc(3.5rem+1px+3.0625rem+var(--spacing-safe-top)-var(--chrome-hide,0px)-var(--chrome-p,0)*6.5625rem)] z-30 sm:top-[3.0625rem]"
          : below === "bar"
            ? "top-[calc(3.5rem+1px+var(--spacing-safe-top)-var(--chrome-hide,0px)-var(--chrome-p,0)*3.5rem)] z-30 sm:top-0"
            : // Above the tab strip under it, so a tooltip from the actions overlays it.
              "top-[calc(3.5rem+1px+var(--spacing-safe-top)-var(--chrome-hide,0px)-var(--chrome-p,0)*6.5625rem)] z-[35] sm:top-0",
      )}
    >
      <nav
        aria-label="Sport"
        className="relative flex h-full min-w-0 flex-1 items-center gap-2 overflow-x-auto overscroll-x-contain px-4 [scrollbar-width:none]"
      >
        {[...(withAll ? [null] : []), ...filters].map((f) => {
          const isActive = (f?.key ?? null) === (active?.key ?? null);
          return (
            <Link
              key={f?.key ?? "all"}
              href={hrefFor(f?.key ?? null)}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                isActive ? "border-fg bg-fg text-black" : "border-border text-fg-muted hover:border-border-strong hover:text-fg",
              )}
            >
              {f && <span aria-hidden="true">{SPORT_EMOJI[f.sport]}</span>}
              {f?.label ?? "All"}
            </Link>
          );
        })}
        <ScrollActiveTab />
      </nav>
      {actions && <div className="flex shrink-0 items-center gap-1 border-l border-border pl-1 pr-2">{actions}</div>}
    </div>
  );
}
