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
    <div className="shell py-10">
      {/* -------------------------------------------------------------- head */}
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">The board</h1>
      <p className="mt-1.5 text-sm text-fg-muted">
        Every day&apos;s picks, newest first, graded against the final score. All free during our beta.
      </p>

      {/* Said once, at the top, rather than as a label on fifteen cards. */}
      {(tab === "game" || tab === "prop") && first.todayPicks > 0 && publishedToday && (
        <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-fg-subtle">
          <Circle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>
            Took one of these? Tap its circle. That&apos;s the whole thing — no stake,
            no book, no odds — and it locks when the game starts.
          </span>
        </p>
      )}

      {/* -------------------------------------------------------------- tabs */}
      <nav
        aria-label="Board"
        className="mt-6 -mb-px flex items-center gap-1 overflow-x-auto overscroll-x-contain border-b border-border [scrollbar-width:none]"
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
                "relative inline-flex shrink-0 items-center gap-2 whitespace-nowrap px-3 py-2.5 text-sm font-medium transition-colors",
                isActive ? "text-brand" : "text-fg-muted hover:text-fg",
              )}
            >
              {TAB_LABELS[c]}
              {n > 0 && <span className="num text-xs text-fg-subtle">{n}</span>}
              {isActive && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-brand" />}
            </Link>
          );
        })}
      </nav>

      {/* ----------------------------------------------- community: builder */}
      {isCommunityTab && (
        <div className="mt-8 space-y-10">
          <section aria-labelledby="build-heading">
            <h2 id="build-heading" className="text-sm font-semibold tracking-tight">
              Build a parlay
            </h2>
            <div className="mt-4">
              <CommunityParlayBuilder games={games} />
            </div>
          </section>

          {myParlaysToday.length > 0 && (
            <section aria-labelledby="my-parlays-heading">
              <h2 id="my-parlays-heading" className="text-sm font-semibold tracking-tight">
                Your parlays today
              </h2>
              <p className="mt-1 text-xs text-fg-subtle">
                Graded leg by leg as the games finish. Shared ones appear below for
                everyone; private ones only here and on My bets.
              </p>
              <div className="mt-4 grid gap-3">
                {myParlaysToday.map((pl) => (
                  <ParlayCard key={pl.id} parlay={pl}>
                    <div className="flex items-center gap-3">
                      <ShareToggle parlayId={pl.id} shared={pl.shared} />
                      {pl.open && <DeleteParlayButton parlayId={pl.id} />}
                    </div>
                  </ParlayCard>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* --------------------------------------------------------- the days */}
      <div className="mt-6">
        {first.node}
        <LoadMore key={tab} next={first.next} load={loadBoardAction.bind(null, tab)} />
      </div>

      {tab === "parlay" && (
        <p className="mt-10 text-sm text-fg-muted">
          Want your own?{" "}
          <Link href={tabHref("community")} className="text-brand hover:underline">
            Build one on Community parlays
          </Link>{" "}
          from any line on today&apos;s games.
        </p>
      )}
    </div>
  );
}
