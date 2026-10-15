import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { Circle } from "lucide-react";
import { db } from "@/db";
import { picks as picksTable, slates } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import {
  PICKS_PER_SLATE,
  TAB_LABELS,
  pickTabs,
  categoryFromParam,
  sportFilterFromParam,
  tabFromParam,
} from "@/lib/board";
import { SportPills } from "@/components/board/sport-pills";
import { LoadMore } from "@/components/load-more";
import { SocialShell } from "@/components/social/social-shell";
import { InfoTip } from "@/components/ui/info-tip";
import { ScrollActiveTab } from "@/components/ui/scroll-active-tab";
import { after } from "next/server";
import { refreshResults } from "@/lib/odds/sync";
import { slateDateString } from "@/lib/slate-date";
import { loadBoardAction } from "@/app/actions/feeds";
import { loadBoardDays } from "./board-days";
import { cn } from "@/lib/utils";
import { viewerAccess } from "@/lib/billing/access";
import { SubscribedBanner } from "@/components/billing/subscribed-banner";
import { TIERS } from "@/lib/tiers";

export const metadata: Metadata = {
  title: "Picks",
  description: `${PICKS_PER_SLATE.game} game bets and ${PICKS_PER_SLATE.prop} player props, day by day.`,
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
 * its featured picks. Testers' shared parlays live on their own page,
 * Community (/community), which is also where you build one.
 *
 * Laid out like Home: the 600px column with hairlines either side, and every
 * pick, ticket and day heading a full-width row rather than a boxed card.
 *
 * Testers see published days; admins also see drafts (with a badge).
 */
export default async function PicksPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; sport?: string; subscribed?: string }>;
}) {
  const [auth, params] = await Promise.all([getAuth(), searchParams]);
  if (!auth) redirect("/login?next=/picks");

  // Shared tickets have their own page now; the old tab's links land there.
  if (params.category === "community") redirect(`/community${params.sport ? `?sport=${params.sport}` : ""}`);

  const today = slateDateString();
  // Three tabs: two pick categories and Oobee's parlays.
  const requested = tabFromParam(params.category);
  const tab = requested === "community" ? "game" : requested;
  const category = categoryFromParam(params.category);
  // The pill under the tabs — a league, or a whole sport for soccer/tennis.
  const sportFilter = sportFilterFromParam(params.sport);
  // Grade anything that has finished — after the response, so nobody waits
  // on the odds provider to see the page (see refreshResults).
  after(refreshResults);

  const [first, todaySlate] = await Promise.all([
    loadBoardDays({ auth, tab, category, sportFilter, before: null }),
    db.select({ publishedAt: slates.publishedAt }).from(slates).where(eq(slates.date, today)).limit(1),
  ]);
  const publishedToday = Boolean(todaySlate[0]?.publishedAt);
  // Back from Stripe Checkout: say so, and wait out the webhook.
  const justSubscribed = params.subscribed === "1" ? await viewerAccess(auth) : null;
  const plan = justSubscribed?.access && justSubscribed.access !== "free" ? TIERS[justSubscribed.access].name : null;

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
      {/* The page is named by the nav and the tabs; the heading is for screen readers. */}
      <h1 className="sr-only">Picks</h1>
      {justSubscribed && <SubscribedBanner tierName={plan} />}

      {/* -------------------------------------------------------------- tabs */}
      {/* Home's tab strip, scrollable on a narrow phone, with the info tip at
          its right end. It sticks under the phone's top bar, with the sport
          pills below it; on a phone both slide away with the bar as you scroll
          down (and come back with it), leaving the day heading at the top.
          Its height is fixed (3.0625rem, border included) because the other
          offsets are written in terms of it. */}
      <div className="sticky top-[calc(3.5rem+1px+var(--spacing-safe-top)-var(--chrome-hide,0px)-var(--chrome-p,0)*6.5625rem)] z-[35] flex h-[3.0625rem] border-b border-border bg-black/80 backdrop-blur-xl sm:top-0">
        <nav
          aria-label="Board"
          className="relative flex min-w-0 flex-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none]"
        >
          {pickTabs.map((c) => {
            const isActive = c === tab;
            // Today's count; the parlay tab counts its own table.
            const n = c === "parlay" ? 0 : (countFor.get(c) ?? 0);
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
        {/* Outside the scrolling strip, so its panel isn't clipped by it; the
            strip sits a layer above the sport pills (z 35 over 30) so the
            panel opens over them, and below the phone's top bar (40). */}
        <div className="flex shrink-0 items-center pr-2">
          <InfoTip label="About Picks">
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

      {/* ------------------------------------------------------ sport pills */}
      <SportPills active={sportFilter} hrefFor={pillHref} below="tabs" />

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
          <Link href="/community/new" className="text-brand hover:underline">
            Build one on Community
          </Link>{" "}
          from any line on today&apos;s games.
        </p>
      )}
    </SocialShell>
  );
}
