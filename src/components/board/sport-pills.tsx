import Link from "next/link";
import { SPORT_FILTERS, type SportFilter } from "@/lib/board";
import { SPORT_EMOJI } from "@/components/pick-card";
import { ScrollActiveTab } from "@/components/ui/scroll-active-tab";
import { cn } from "@/lib/utils";

/**
 * The sport pills — All, NFL, NBA, MLB, NHL, Soccer, Tennis — on Picks and on
 * Community. They stick: under Picks' tab strip (`below="tabs"`), or straight
 * under the phone's top bar on Community, which has no tabs (`below="bar"`).
 * Fixed at 3.5rem with the border, since the day headings stick under them
 * and their offset is written in terms of it (board-days.tsx).
 */
export function SportPills({
  active,
  hrefFor,
  below,
}: {
  active: SportFilter | null;
  hrefFor: (key: string | null) => string;
  below: "tabs" | "bar";
}) {
  return (
    <nav
      aria-label="Sport"
      className={cn(
        "sticky z-30 flex h-14 items-center gap-2 overflow-x-auto overscroll-x-contain border-b border-border bg-black/80 px-4 backdrop-blur-xl [scrollbar-width:none]",
        below === "tabs"
          ? "top-[calc(3.5rem+1px+3.0625rem+var(--spacing-safe-top)-var(--chrome-hide,0px))] sm:top-[3.0625rem]"
          : "top-[calc(3.5rem+1px+var(--spacing-safe-top)-var(--chrome-hide,0px))] sm:top-0",
      )}
    >
      {[null, ...SPORT_FILTERS].map((f) => {
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
  );
}
