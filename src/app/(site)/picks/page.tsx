import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, desc, eq, inArray, lt, lte, sql } from "drizzle-orm";
import { Circle } from "lucide-react";
import { db } from "@/db";
import { parlays as parlaysTable, pickFollows, picks as picksTable, slates } from "@/db/schema";
import type { Pick } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import {
  CATEGORY_NOUN,
  PICKS_PER_SLATE,
  TAB_LABELS,
  boardTabs,
  categoryFromParam,
  tabFromParam,
  visiblePicks,
} from "@/lib/board";
import { getCommunityParlays, getOobeeParlays, getUserParlays, type ParlayView } from "@/lib/parlay-store";
import { ParlayCard } from "@/components/parlay-card";
import { DeleteParlayButton } from "@/components/parlay-builder";
import { CommunityParlayBuilder, ShareToggle } from "@/components/community-parlay-builder";
import { Avatar, displayNameOf } from "@/components/social/identity";
import { getSlateGames } from "@/lib/odds/board";
import { ensureSlateOdds, refreshResults } from "@/lib/odds/sync";
import { followWindowOpen, type ViewerFollow } from "@/lib/follows";
import { pickProfit } from "@/lib/settlement";
import { PickCard, TopPickCard } from "@/components/pick-card";
import { Badge } from "@/components/ui/badge";
import { Reveal } from "@/components/ui/motion";
import { isValidSlateDate, slateDateString } from "@/lib/slate-date";
import { formatSlateDate } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Picks",
  description: `All ${PICKS_PER_SLATE.game} game bets and ${PICKS_PER_SLATE.prop} player props, day by day — free during our beta.`,
  robots: { index: false, follow: false },
};

// Per-request: what a viewer may see depends on whether they're signed in
// and whether they're an admin.
export const dynamic = "force-dynamic";

/** Days per page. "Show older days" pages back from the last one shown. */
const DAYS_PER_PAGE = 5;

/** Whole days between two YYYY-MM-DD slate dates (a minus b). */
function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86_400_000);
}

/**
 * The board, day by day: today first, then every earlier day newest first,
 * each under its own heading — so the record reads as one list rather than a
 * date to pick. Today keeps its top-pick hero and the parlay builder; earlier
 * days show their board as it was graded, with the day's record in the
 * heading.
 *
 * Testers see published days; admins also see drafts (with a badge).
 */
export default async function PicksPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; before?: string; welcome?: string }>;
}) {
  const [auth, params] = await Promise.all([getAuth(), searchParams]);
  if (!auth) redirect("/login?next=/picks");

  const today = slateDateString();
  // `before` pages back: everything strictly older than that day.
  const before = params.before && isValidSlateDate(params.before) && params.before <= today ? params.before : null;
  const firstPage = before === null;

  // Three kinds of tab: two pick categories, Oobee's parlays, and the
  // Community parlays that read a different table entirely.
  const tab = tabFromParam(params.category);
  const isParlayTab = tab === "parlay";
  const isCommunityTab = tab === "community";
  const category = categoryFromParam(params.category);
  // Grade anything whose game has finished before reading results.
  await refreshResults();

  /* ------------------------------------------------------------ the days */

  // Which days this page shows: only days with something on this tab, so a
  // slate with no props never leaves an empty "Player props" day behind. The
  // pick tabs follow slates (published ones, plus drafts for admins) that
  // carry this tab's picks or Oobee parlays; Community follows the days
  // anyone shared a parlay, since it needs no Oobee slate. Today always leads
  // page one, so there is somewhere to say "nothing yet".
  const upTo = before ? lt(slates.date, before) : lte(slates.date, today);
  const dayRows: { date: string }[] = isCommunityTab
    ? await db
        .selectDistinct({ date: parlaysTable.slateDate })
        .from(parlaysTable)
        .where(
          and(
            eq(parlaysTable.shared, true),
            before ? lt(parlaysTable.slateDate, before) : lte(parlaysTable.slateDate, today),
          ),
        )
        .orderBy(desc(parlaysTable.slateDate))
        .limit(DAYS_PER_PAGE + 1)
    : await db
        .select({ date: slates.date })
        .from(slates)
        .where(
          and(
            upTo,
            auth.isAdmin ? undefined : sql`${slates.publishedAt} is not null`,
            isParlayTab
              ? sql`exists (select 1 from ${parlaysTable} where ${parlaysTable.slateDate} = ${slates.date} and ${parlaysTable.ownerId} is null)`
              : sql`exists (select 1 from ${picksTable} where ${picksTable.slateDate} = ${slates.date} and ${picksTable.category} = ${category})`,
          ),
        )
        .orderBy(desc(slates.date))
        .limit(DAYS_PER_PAGE + 1);

  const found = dayRows.map((d) => d.date);
  const withToday = firstPage && !found.includes(today) ? [today, ...found] : found;
  const days = withToday.slice(0, DAYS_PER_PAGE);
  const olderFrom = withToday.length > DAYS_PER_PAGE || found.length > DAYS_PER_PAGE ? days.at(-1)! : null;

  const slateRows = days.length
    ? await db.select({ date: slates.date, publishedAt: slates.publishedAt }).from(slates).where(inArray(slates.date, days))
    : [];
  const publishedOn = new Set(slateRows.filter((s) => s.publishedAt).map((s) => s.date));
  const draftOn = new Set(slateRows.filter((s) => !s.publishedAt).map((s) => s.date));
  // Admins preview drafts; nobody else sees an unpublished slate exists.
  const visibleDays = days.filter((d) => publishedOn.has(d) || auth.isAdmin);

  /* ----------------------------------------------------------- pick tabs */

  // One query for every day on the page. (slate_date, category) is the
  // leading edge of picks_slate_rank_unique, so this is an index range read,
  // and the tab you are not looking at is never fetched.
  const rows: Pick[] =
    !isParlayTab && !isCommunityTab && visibleDays.length
      ? await db
          .select()
          .from(picksTable)
          .where(and(inArray(picksTable.slateDate, visibleDays), eq(picksTable.category, category)))
          .orderBy(asc(picksTable.rank))
      : [];
  // Admins preview whole slates; everyone else sees each day's top VISIBLE_PICKS.
  const picksOn = new Map(
    visibleDays.map((d) => [d, visiblePicks(rows.filter((r) => r.slateDate === d), auth.isAdmin)]),
  );
  const shownPicks = [...picksOn.values()].flat();

  // Which of these picks this viewer has already ticked off. Keyed on
  // (user_id, pick_id) in that order — see the note on pick_follows in
  // db/schema.ts.
  const takenIds = shownPicks.length
    ? new Set(
        (
          await db
            .select({ pickId: pickFollows.pickId })
            .from(pickFollows)
            .where(and(eq(pickFollows.userId, auth.user.id), inArray(pickFollows.pickId, shownPicks.map((p) => p.id))))
        ).map((r) => r.pickId),
      )
    : new Set<string>();

  /**
   * An unpublished draft gets no control at all: an admin previewing a board
   * has nothing to take yet, and the action refuses it anyway.
   */
  function followFor(p: Pick): ViewerFollow | undefined {
    if (!publishedOn.has(p.slateDate)) return undefined;
    return { taken: takenIds.has(p.id), open: followWindowOpen(p) };
  }

  // Counts for today's tab labels — the alternative is a tab that claims
  // nothing is there until you click it.
  const tallies =
    publishedOn.has(today) || auth.isAdmin
      ? await db
          .select({ category: picksTable.category, n: sql<number>`count(*)::int` })
          .from(picksTable)
          .where(eq(picksTable.slateDate, today))
          .groupBy(picksTable.category)
      : [];
  const countFor = new Map(tallies.map((t) => [t.category, t.n]));

  /* --------------------------------------------------------- parlay tabs */

  const oobeeOn = new Map<string, ParlayView[]>(
    isParlayTab ? await Promise.all(visibleDays.map(async (d) => [d, await getOobeeParlays(d)] as const)) : [],
  );

  // The builder and "your parlays today" only lead page one. The odds feed
  // is refreshed here only if the stored copy is stale.
  const showBuilder = isCommunityTab && firstPage;
  if (showBuilder) await ensureSlateOdds(today);
  const [communityLists, myParlays, games] = isCommunityTab
    ? await Promise.all([
        Promise.all(days.map(async (d) => [d, await getCommunityParlays(d)] as const)),
        showBuilder ? getUserParlays(auth.user.id) : Promise.resolve([]),
        showBuilder ? getSlateGames(today) : Promise.resolve([]),
      ])
    : [[], [], []];
  const communityOn = new Map(communityLists);
  const myParlaysToday = myParlays.filter((p) => p.slateDate === today);

  /* ------------------------------------------------------------- render */

  const tabHref = (c: string) => `/picks?category=${c}`;
  const hasTodayPicks = (picksOn.get(today)?.length ?? 0) > 0;

  return (
    <div className="shell py-10">
      {params.welcome === "1" && (
        <div
          role="status"
          className="mb-6 rounded-lg border border-brand/25 bg-brand/5 px-4 py-3 text-sm text-brand"
        >
          Account created. All {PICKS_PER_SLATE.game} game bets and{" "}
          {PICKS_PER_SLATE.prop} player props are free, every day, during our beta.
        </div>
      )}

      {/* -------------------------------------------------------------- head */}
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">The board</h1>
      <p className="mt-1.5 text-sm text-fg-muted">
        Every day&apos;s picks, newest first, graded against the final score. All free during our beta.
      </p>

      {/* Said once, at the top, rather than as a label on fifteen cards. */}
      {firstPage && !isParlayTab && !isCommunityTab && hasTodayPicks && publishedOn.has(today) && (
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

      {!firstPage && (
        <p className="mt-6 text-sm">
          <Link href={tabHref(tab)} className="text-brand hover:underline">
            ← Back to today
          </Link>
        </p>
      )}

      {/* ----------------------------------------------- community: builder */}
      {showBuilder && (
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
        {days.map((d) => {
          const isToday = d === today;
          const draft = draftOn.has(d);
          const dayPicks = picksOn.get(d) ?? [];

          if (isCommunityTab) {
            // Today's own parlays are already listed above with their controls.
            const list = (communityOn.get(d) ?? []).filter((pl) => !(isToday && pl.ownerId === auth.user.id));
            return (
              <DaySection key={d} date={d} today={today}>
                {list.length === 0 ? (
                  <Empty>{isToday ? "Nobody has shared a parlay today yet. Build one and be first." : "No shared parlays this day."}</Empty>
                ) : (
                  <div className="grid gap-3">
                    {list.map((pl) => (
                      <ParlayCard key={pl.id} parlay={pl}>
                        <Owner parlay={pl} />
                      </ParlayCard>
                    ))}
                  </div>
                )}
              </DaySection>
            );
          }

          if (isParlayTab) {
            const list = oobeeOn.get(d) ?? [];
            return (
              <DaySection key={d} date={d} today={today} draft={draft && auth.isAdmin}>
                {list.length === 0 ? (
                  <Empty>{isToday ? "None up yet today — they go out with the rest of the board." : "No Oobee parlays this day."}</Empty>
                ) : (
                  <div className="grid gap-3">
                    {list.map((pl, i) => (
                      <Reveal key={pl.id} delay={Math.min(i * 0.03, 0.2)}>
                        <ParlayCard parlay={pl} featured={isToday && pl.rank === 1} />
                      </Reveal>
                    ))}
                  </div>
                )}
              </DaySection>
            );
          }

          // Pick tabs. Today leads with its top pick; earlier days are shown as
          // they were graded, every rank in the grid.
          const [top, ...rest] = isToday ? dayPicks : [undefined, ...dayPicks];
          return (
            <DaySection key={d} date={d} today={today} draft={draft && auth.isAdmin} picks={dayPicks}>
              {dayPicks.length === 0 ? (
                <Empty>
                  {isToday
                    ? `No ${CATEGORY_NOUN[category]}s up yet — picks go out before the first kick-off.`
                    : `No ${CATEGORY_NOUN[category]}s this day.`}
                </Empty>
              ) : (
                <>
                  {top && (
                    <Reveal>
                      <TopPickCard pick={top} follow={followFor(top)} />
                    </Reveal>
                  )}
                  {rest.length > 0 && (
                    <div className={cn("grid gap-3 sm:grid-cols-2", top && "mt-3")}>
                      {rest.map((p, i) => (
                        <Reveal key={p!.id} delay={Math.min(i * 0.02, 0.2)}>
                          <PickCard pick={p!} follow={followFor(p!)} />
                        </Reveal>
                      ))}
                    </div>
                  )}
                </>
              )}
            </DaySection>
          );
        })}
      </div>

      {olderFrom && (
        <Link
          href={`${tabHref(tab)}&before=${olderFrom}`}
          className="mt-10 block rounded-lg border border-border py-3 text-center text-sm text-brand transition-colors hover:bg-surface/60"
        >
          Show older days
        </Link>
      )}

      {isParlayTab && firstPage && (
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

/**
 * One day of the board. The heading sticks while you scroll through that day
 * (under the phone's top bar, at the very top beside the sidebar), and on a
 * day with graded picks carries its record: won–lost(–push) and net units.
 */
function DaySection({
  date,
  today,
  draft,
  picks,
  children,
}: {
  date: string;
  today: string;
  draft?: boolean;
  picks?: Pick[];
  children: React.ReactNode;
}) {
  const diff = dayDiff(today, date);
  const name = diff === 0 ? "Today" : diff === 1 ? "Yesterday" : null;

  const settled = (picks ?? []).filter((p) => p.status !== "pending");
  const won = settled.filter((p) => p.status === "won").length;
  const lost = settled.filter((p) => p.status === "lost").length;
  const pushed = settled.filter((p) => p.status === "push").length;
  const units = settled.reduce((sum, p) => sum + pickProfit(p), 0);

  return (
    <section aria-labelledby={`day-${date}-heading`} id={`day-${date}`} className="mt-8 scroll-mt-20">
      <div className="sticky top-[calc(3.5rem+var(--spacing-safe-top))] z-20 -mx-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border bg-black/80 px-4 py-3 backdrop-blur-xl sm:top-0 sm:-mx-6 sm:px-6">
        <h2 id={`day-${date}-heading`} className="flex items-baseline gap-2 text-base font-semibold tracking-tight">
          {name && <span>{name}</span>}
          <span className={cn("num", name ? "text-sm font-normal text-fg-muted" : "")}>{formatSlateDate(date)}</span>
          {draft && <Badge variant="pending">Draft — admin preview</Badge>}
        </h2>
        {settled.length > 0 && (
          <p className="num text-sm text-fg-muted">
            {won}–{lost}
            {pushed > 0 ? `–${pushed}` : ""}
            <span className="mx-1.5 text-fg-subtle" aria-hidden="true">·</span>
            <span className={cn(units > 0 ? "text-hit" : units < 0 ? "text-miss" : "")}>
              {units > 0 ? "+" : ""}
              {units.toFixed(2)}u
            </span>
          </p>
        )}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-fg-muted">{children}</p>;
}

/** Who shared a Community parlay, in the ticket's action slot. */
function Owner({ parlay }: { parlay: ParlayView }) {
  if (!parlay.ownerUsername) return null;
  const name = displayNameOf({ displayName: parlay.ownerDisplayName, username: parlay.ownerUsername });
  return (
    <Link
      href={`/u/${parlay.ownerUsername}`}
      className="flex min-w-0 items-center gap-2 text-xs text-fg-muted hover:text-fg"
    >
      <Avatar name={name} size="sm" className="size-6 text-[0.625rem]" />
      <span className="truncate">
        {name} <span className="text-fg-subtle">@{parlay.ownerUsername}</span>
      </span>
    </Link>
  );
}
