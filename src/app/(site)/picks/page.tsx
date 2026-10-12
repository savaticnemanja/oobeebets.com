import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { Circle } from "lucide-react";
import { db } from "@/db";
import { picks as picksTable, slates } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import { PICKS_PER_SLATE, TAB_LABELS, boardTabs, categoryFromParam, tabFromParam } from "@/lib/board";
import { getUserParlays } from "@/lib/parlay-store";
import { ParlayCard } from "@/components/parlay-card";
import { DeleteParlayButton } from "@/components/parlay-builder";
import { CommunityParlayBuilder, ShareToggle } from "@/components/community-parlay-builder";
import { LoadMore } from "@/components/load-more";
import { SocialShell } from "@/components/social/social-shell";
import { InfoTip } from "@/components/ui/info-tip";
import { ScrollActiveTab } from "@/components/ui/scroll-active-tab";
import { getSlateGames } from "@/lib/odds/board";
import { ensureSlateOdds, refreshResults } from "@/lib/odds/sync";
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
 * renders both this first chunk and every later one). Today keeps its
 * top-pick hero and, on Community parlays, the builder and your own tickets.
 *
 * Laid out like Home: the 600px column with hairlines either side, and every
 * pick, ticket and day heading a full-width row rather than a boxed card.
 *
 * Testers see published days; admins also see drafts (with a badge).
 */
export default async function PicksPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const [auth, params] = await Promise.all([getAuth(), searchParams]);
  if (!auth) redirect("/login?next=/picks");

  const today = slateDateString();
  // Three kinds of tab: two pick categories, Oobee's parlays, and the
  // Community parlays that read a different table entirely.
  const tab = tabFromParam(params.category);
  const isCommunityTab = tab === "community";
  const category = categoryFromParam(params.category);
  // Grade anything whose game has finished before reading results.
  await refreshResults();

  // The builder and "your parlays today" lead the Community tab. The odds
  // feed is refreshed here only if the stored copy is stale.
  if (isCommunityTab) await ensureSlateOdds(today);
  const [first, todaySlate, myParlays, games] = await Promise.all([
    loadBoardDays({ auth, tab, category, before: null }),
    db.select({ publishedAt: slates.publishedAt }).from(slates).where(eq(slates.date, today)).limit(1),
    isCommunityTab ? getUserParlays(auth.user.id) : Promise.resolve([]),
    isCommunityTab ? getSlateGames(today) : Promise.resolve([]),
  ]);
  const publishedToday = Boolean(todaySlate[0]?.publishedAt);
  const myParlaysToday = myParlays.filter((p) => p.slateDate === today);

  // Counts for today's tab labels — the alternative is a tab that claims
  // nothing is there until you click it.
  const tallies =
    publishedToday || auth.isAdmin
      ? await db
          .select({ category: picksTable.category, n: sql<number>`count(*)::int` })
          .from(picksTable)
          .where(eq(picksTable.slateDate, today))
          .groupBy(picksTable.category)
      : [];
  const countFor = new Map(tallies.map((t) => [t.category, t.n]));

  const tabHref = (c: string) => `/picks?category=${c}`;

  return (
    <SocialShell>
      {/* -------------------------------------------------------------- head */}
      <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-4">
        <h1 className="text-xl font-bold tracking-tight">The board</h1>
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

      {/* -------------------------------------------------------------- tabs */}
      {/* Home's tab strip, but scrollable: four labels don't fit a phone. */}
      <nav
        aria-label="Board"
        className="relative flex overflow-x-auto overscroll-x-contain border-b border-border [scrollbar-width:none]"
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
                "flex flex-1 shrink-0 justify-center whitespace-nowrap px-4 py-3.5 text-sm transition-colors hover:bg-surface/60",
                isActive ? "font-semibold text-fg" : "text-fg-muted",
              )}
            >
              <span className="relative inline-flex items-center gap-1.5">
                {TAB_LABELS[c]}
                {n > 0 && <span className="num text-xs font-normal text-fg-subtle">{n}</span>}
                {isActive && (
                  <span className="absolute -bottom-3.5 left-0 right-0 h-1 rounded-full bg-brand" aria-hidden="true" />
                )}
              </span>
            </Link>
          );
        })}
        <ScrollActiveTab />
      </nav>

      {/* ----------------------------------------------- community: builder */}
      {isCommunityTab && (
        <>
          <section aria-labelledby="build-heading" className="border-b border-border px-4 py-4">
            <h2 id="build-heading" className="text-base font-bold tracking-tight">
              Build a parlay
            </h2>
            <div className="mt-3">
              <CommunityParlayBuilder games={games} />
            </div>
          </section>

          {myParlaysToday.length > 0 && (
            <section aria-labelledby="my-parlays-heading">
              <div className="border-b border-border px-4 py-3">
                <h2 id="my-parlays-heading" className="text-base font-bold tracking-tight">
                  Your parlays today
                </h2>
                <p className="mt-0.5 text-xs text-fg-subtle">
                  Graded leg by leg as the games finish. Shared ones appear below for
                  everyone; private ones only here and on My bets.
                </p>
              </div>
              {myParlaysToday.map((pl) => (
                <ParlayCard key={pl.id} parlay={pl} variant="row">
                  <div className="flex items-center gap-3">
                    <ShareToggle parlayId={pl.id} shared={pl.shared} />
                    {pl.open && <DeleteParlayButton parlayId={pl.id} />}
                  </div>
                </ParlayCard>
              ))}
            </section>
          )}
        </>
      )}

      {/* --------------------------------------------------------- the days */}
      {first.node}
      <LoadMore key={tab} next={first.next} load={loadBoardAction.bind(null, tab)} />

      {tab === "parlay" && (
        <p className="px-4 py-6 text-sm text-fg-muted">
          Want your own?{" "}
          <Link href={tabHref("community")} className="text-brand hover:underline">
            Build one on Community parlays
          </Link>{" "}
          from any line on today&apos;s games.
        </p>
      )}
    </SocialShell>
  );
}
