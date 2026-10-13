import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { Circle, Plus } from "lucide-react";
import { db } from "@/db";
import { picks as picksTable, slates } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import {
  PICKS_PER_SLATE,
  SPORT_FILTERS,
  TAB_LABELS,
  boardTabs,
  categoryFromParam,
  sportFilterFromParam,
  tabFromParam,
} from "@/lib/board";
import { SPORT_EMOJI } from "@/components/pick-card";
import { LoadMore } from "@/components/load-more";
import { SocialShell } from "@/components/social/social-shell";
import { InfoTip } from "@/components/ui/info-tip";
import { ScrollActiveTab } from "@/components/ui/scroll-active-tab";
import { refreshResults } from "@/lib/odds/sync";
import { slateDateString } from "@/lib/slate-date";
import { loadBoardAction } from "@/app/actions/feeds";
import { loadBoardDays } from "./board-days";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Picks",
  description: `All ${PICKS_PER_SLATE.game} game bets and ${PICKS_PER_SLATE.prop} player props, day by day — free during our beta.`,
  robots: { index: false, follow: false },
};

// Per-request: what a viewer may see depends on whether they're signed in
// and whether they're an admin.
export const dynamic = "force-dynamic";

/**
 * The board, day by day: today first, then every earlier day newest first,
 * each under its own heading — so the record reads as one list rather than a
 * date to pick. Older days load as you scroll (see board-days.tsx, which
 * renders both this first chunk and every later one). Each day leads with
 * its featured picks. Building a parlay is its own page (/picks/new),
 * behind the + in the header.
 *
 * Laid out like Home: the 600px column with hairlines either side, and every
 * pick, ticket and day heading a full-width row rather than a boxed card.
 *
 * Testers see published days; admins also see drafts (with a badge).
 */
export default async function PicksPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; sport?: string }>;
}) {
  const [auth, params] = await Promise.all([getAuth(), searchParams]);
  if (!auth) redirect("/login?next=/picks");

  const today = slateDateString();
  // Three kinds of tab: two pick categories, Oobee's parlays, and the
  // Community parlays that read a different table entirely.
  const tab = tabFromParam(params.category);
  const category = categoryFromParam(params.category);
  // The pill under the tabs — a league, or a whole sport for soccer/tennis.
  const sportFilter = sportFilterFromParam(params.sport);
  // Grade anything whose game has finished before reading results.
  await refreshResults();

  const [first, todaySlate] = await Promise.all([
    loadBoardDays({ auth, tab, category, sportFilter, before: null }),
    db.select({ publishedAt: slates.publishedAt }).from(slates).where(eq(slates.date, today)).limit(1),
  ]);
  const publishedToday = Boolean(todaySlate[0]?.publishedAt);

  // Counts for today's tab labels — the alternative is a tab that claims
  // nothing is there until you click it.
  const tallies =
    publishedToday || auth.isAdmin
      ? await db
          .select({ category: picksTable.category, n: sql<number>`count(*)::int` })
          .from(picksTable)
          .where(
            and(
              eq(picksTable.slateDate, today),
              sportFilter ? eq(picksTable.sport, sportFilter.sport) : undefined,
              sportFilter?.league ? eq(picksTable.league, sportFilter.league) : undefined,
            ),
          )
          .groupBy(picksTable.category)
      : [];
  const countFor = new Map(tallies.map((t) => [t.category, t.n]));

  // Tabs keep the pill and pills keep the tab, so the two combine.
  const sportQuery = sportFilter ? `&sport=${sportFilter.key}` : "";
  const tabHref = (c: string) => `/picks?category=${c}${sportQuery}`;
  const pillHref = (key: string | null) => `/picks?category=${tab}${key ? `&sport=${key}` : ""}`;

  return (
    <SocialShell>
      {/* -------------------------------------------------------------- head */}
      <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-4">
        <h1 className="text-xl font-bold tracking-tight">The board</h1>
        <div className="flex items-center gap-1">
          {/* The parlay builder has its own page; this is the way in, from any tab. */}
          <Link
            href="/picks/new"
            aria-label="Build a parlay"
            title="Build a parlay"
            className="grid size-9 place-items-center rounded-full text-brand transition-colors hover:bg-brand/10"
          >
            <Plus className="size-5" aria-hidden="true" />
          </Link>
          <InfoTip label="About the board">
            <p>
              Every day&apos;s picks, newest first, graded against the final score. All free during
              our beta.
            </p>
            {(tab === "game" || tab === "prop") && (
              <p className="flex items-start gap-2">
                <Circle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                <span>
                  Took one of these? Tap its circle. That&apos;s the whole thing — no stake, no book,
                  no odds — and it locks when the game starts.
                </span>
              </p>
            )}
          </InfoTip>
        </div>
      </div>

      {/* -------------------------------------------------------------- tabs */}
      {/* Home's tab strip, but scrollable: four labels don't fit a phone. It
          sticks, as Home's does — under the phone's top bar, riding up with
          it as that slides away — with the sport pills and day headings
          stacked below it. Its height is fixed (3.0625rem, border included)
          because their offsets are written in terms of it. */}
      <nav
        aria-label="Board"
        className="sticky top-[calc(3.5rem+1px+var(--spacing-safe-top)-var(--chrome-hide,0px))] z-30 flex h-[3.0625rem] overflow-x-auto overscroll-x-contain border-b border-border bg-black/80 backdrop-blur-xl [scrollbar-width:none] sm:top-0"
      >
        {boardTabs.map((c) => {
          const isActive = c === tab;
          // Today's count; the parlay tabs count their own tables.
          const n = c === "parlay" || c === "community" ? 0 : (countFor.get(c) ?? 0);
          return (
            <Link
              key={c}
              href={tabHref(c)}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex flex-1 shrink-0 items-center justify-center whitespace-nowrap px-4 text-sm transition-colors hover:bg-surface/60",
                isActive ? "font-semibold text-fg" : "text-fg-muted",
              )}
            >
              <span className="relative inline-flex items-center gap-1.5">
                {TAB_LABELS[c]}
                {n > 0 && <span className="num text-xs font-normal text-fg-subtle">{n}</span>}
                {isActive && (
                  <span className="absolute -bottom-[0.875rem] left-0 right-0 h-1 rounded-full bg-brand" aria-hidden="true" />
                )}
              </span>
            </Link>
          );
        })}
        <ScrollActiveTab />
      </nav>

      {/* ------------------------------------------------------ sport pills */}
      {/* Sticks right under the tabs (which are 3.0625rem tall), riding up
          with them as the phone's top bar slides away. Fixed height,
          3.5rem with its border, because the day headings stick below it
          and their offset is written in terms of it, in board-days.tsx. */}
      <nav
        aria-label="Sport"
        className="sticky top-[calc(3.5rem+1px+3.0625rem+var(--spacing-safe-top)-var(--chrome-hide,0px))] z-30 flex h-14 items-center gap-2 overflow-x-auto overscroll-x-contain border-b border-border bg-black/80 px-4 backdrop-blur-xl [scrollbar-width:none] sm:top-[3.0625rem]"
      >
        {[null, ...SPORT_FILTERS].map((f) => {
          const isActive = (f?.key ?? null) === (sportFilter?.key ?? null);
          return (
            <Link
              key={f?.key ?? "all"}
              href={pillHref(f?.key ?? null)}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                isActive
                  ? "border-fg bg-fg text-black"
                  : "border-border text-fg-muted hover:border-border-strong hover:text-fg",
              )}
            >
              {f && <span aria-hidden="true">{SPORT_EMOJI[f.sport]}</span>}
              {f?.label ?? "All"}
            </Link>
          );
        })}
        <ScrollActiveTab />
      </nav>

      {/* --------------------------------------------------------- the days */}
      {first.node}
      <LoadMore
        key={`${tab}:${sportFilter?.key ?? ""}`}
        next={first.next}
        load={loadBoardAction.bind(null, tab, sportFilter?.key ?? "")}
      />

      {tab === "parlay" && (
        <p className="px-4 py-6 text-sm text-fg-muted">
          Want your own?{" "}
          <Link href="/picks/new" className="text-brand hover:underline">
            Build one
          </Link>{" "}
          from any line on today&apos;s games.
        </p>
      )}
    </SocialShell>
  );
}
