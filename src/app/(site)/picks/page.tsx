import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { CalendarDays, Circle } from "lucide-react";
import { db } from "@/db";
import { pickFollows, picks as picksTable, slates } from "@/db/schema";
import type { Pick } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import {
  CATEGORY_NOUN,
  PICKS_PER_SLATE,
  TAB_NOUN,
  TAB_LABELS,
  boardTabs,
  categoryFromParam,
  tabFromParam,
  visiblePicks,
} from "@/lib/board";
import { getCommunityParlays, getOobeeParlays, getUserParlays } from "@/lib/parlay-store";
import { ParlayCard } from "@/components/parlay-card";
import { DeleteParlayButton } from "@/components/parlay-builder";
import { CommunityParlayBuilder, ShareToggle } from "@/components/community-parlay-builder";
import { Avatar, displayNameOf } from "@/components/social/identity";
import { getSlateGames } from "@/lib/odds/board";
import { ensureSlateOdds, refreshResults } from "@/lib/odds/sync";
import { followWindowOpen, type ViewerFollow } from "@/lib/follows";
import { PickCard, TopPickCard } from "@/components/pick-card";
import { Badge } from "@/components/ui/badge";
import { Reveal } from "@/components/ui/motion";
import { SlateDatePicker } from "@/components/slate-date-picker";
import { isValidSlateDate, slateDateString } from "@/lib/slate-date";
import { formatSlateDate } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Today's picks",
  description: `All ${PICKS_PER_SLATE.game} game bets and ${PICKS_PER_SLATE.prop} player props for today — free during our beta.`,
  robots: { index: false, follow: false },
};

// Per-request: what a viewer may see depends on whether they're signed in
// and whether they're an admin.
export const dynamic = "force-dynamic";

export default async function PicksPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; category?: string; welcome?: string }>;
}) {
  const [auth, params] = await Promise.all([getAuth(), searchParams]);
  if (!auth) redirect("/login?next=/picks");

  const today = slateDateString();
  const requested = params.date && isValidSlateDate(params.date) ? params.date : today;

  // Only admins can browse history — everyone else always sees today's board.
  const date = auth.isAdmin ? requested : today;
  // Three tabs, two of which are pick categories. `category` stays the thing
  // the picks query filters on; `tab` is what the reader is looking at, and on
  // the parlay tab it points at a different table entirely.
  const tab = tabFromParam(params.category);
  const isParlayTab = tab === "parlay";
  const isCommunityTab = tab === "community";
  // Grade anything whose game has finished before reading results.
  await refreshResults();
  const category = categoryFromParam(params.category);

  const [slate] = await db.select().from(slates).where(eq(slates.date, date)).limit(1);

  // Admins preview drafts; nobody else sees an unpublished slate exists.
  const visible = Boolean(slate?.publishedAt) || auth.isAdmin;

  // Filtered in SQL rather than in memory: (slate_date, category) is the
  // leading edge of picks_slate_rank_unique, so the tab query is an index
  // range read, and the tab you are not looking at is never fetched.
  const rows: Pick[] = visible && !isParlayTab && !isCommunityTab
    ? await db
        .select()
        .from(picksTable)
        .where(and(eq(picksTable.slateDate, date), eq(picksTable.category, category)))
        .orderBy(asc(picksTable.rank))
    : [];

  // Counts for the tab labels — cheap, and the alternative is a tab that
  // claims nothing is there until you click it.
  const tallies = visible
    ? await db
        .select({ category: picksTable.category, n: sql<number>`count(*)::int` })
        .from(picksTable)
        .where(eq(picksTable.slateDate, date))
        .groupBy(picksTable.category)
    : [];
  const countFor = new Map(tallies.map((t) => [t.category, t.n]));

  // Admins preview the whole slate; everyone else sees the top VISIBLE_PICKS.
  const view = visiblePicks(rows, auth.isAdmin);
  const [top, ...rest] = view;

  // Only the admin date picker consumes this, and only admins can browse to
  // another date at all — so a tester's board does not pay for the query.
  const availableDates = auth.isAdmin
    ? await db
        .select({ date: slates.date })
        .from(slates)
        .where(sql`${slates.publishedAt} is not null`)
        .orderBy(sql`${slates.date} desc`)
        .limit(30)
    : [];

  // Which of these picks this viewer has already ticked off. Keyed on
  // (user_id, pick_id) in that order, so this is an index-only scan over at
  // most fifteen keys — see the note on pick_follows in db/schema.ts.
  const published = Boolean(slate?.publishedAt);
  const takenIds =
    published && view.length > 0
      ? new Set(
          (
            await db
              .select({ pickId: pickFollows.pickId })
              .from(pickFollows)
              .where(
                and(
                  eq(pickFollows.userId, auth.user.id),
                  inArray(
                    pickFollows.pickId,
                    view.map((p) => p.id),
                  ),
                ),
              )
          ).map((r) => r.pickId),
        )
      : new Set<string>();

  /**
   * An unpublished draft gets no control at all: an admin previewing tomorrow's
   * board has nothing to take yet, and the action refuses it anyway.
   */
  function followFor(p: Pick): ViewerFollow | undefined {
    if (!published) return undefined;
    return { taken: takenIds.has(p.id), open: followWindowOpen(p) };
  }

  // The parlay tabs read other tables, so none of this is fetched for the tabs
  // that do not show it. The viewer's own parlays are filtered to the day on
  // screen — their full history lives on /my-bets.
  const oobeeParlays = isParlayTab && visible ? await getOobeeParlays(date) : [];

  // The Community tab needs no Oobee slate at all: it is built from the odds
  // feed, which is refreshed here only if the stored copy is stale.
  if (isCommunityTab) await ensureSlateOdds(date);
  const [communityParlays, myParlays, games] = isCommunityTab
    ? await Promise.all([
        getCommunityParlays(date),
        getUserParlays(auth.user.id),
        getSlateGames(date),
      ])
    : [[], [], []];

  const myParlaysToday = myParlays.filter((p) => p.slateDate === date);
  const othersShared = communityParlays.filter((p) => p.ownerId !== auth.user.id);

  /** What the heading counts — the parlay tab has its own table. */
  const tabCount = isParlayTab
    ? oobeeParlays.length
    : isCommunityTab
      ? communityParlays.length
      : view.length;

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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {date === today ? "Today's board" : formatSlateDate(date)}
          </h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg-muted">
            <CalendarDays className="size-3.5" aria-hidden="true" />
            <span className="num">{formatSlateDate(date)}</span>
            {slate?.publishedAt || isCommunityTab ? (
              <>
                <span aria-hidden="true">·</span>
                {/* Counted off whichever table this tab reads. Before, the
                    parlay tab reported the picks query it never ran, which
                    rendered as "0 game bets" above a board full of parlays. */}
                <span>
                  {tabCount} {TAB_NOUN[tab]}
                  {tabCount === 1 ? "" : "s"}, free
                </span>
              </>
            ) : null}
            {!slate?.publishedAt && countFor.size > 0 && (
              <Badge variant="pending">Draft — admin preview</Badge>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {auth.isAdmin && availableDates.length > 0 && (
            <SlateDatePicker dates={availableDates.map((d) => d.date)} current={date} />
          )}
        </div>
      </div>

      {/* -------------------------------------------------------------- hint */}
      {/* Said once, at the top, rather than as a label on fifteen cards. The
          circles are discoverable on their own, but "it is one tap and we
          never ask for a stake" is not, and it is the part that decides
          whether a tester bothers. */}
      {published && !isParlayTab && !isCommunityTab && view.length > 0 && (
        <p className="mt-5 flex items-start gap-2 text-xs leading-relaxed text-fg-subtle">
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
        className="mt-8 -mb-px flex items-center gap-1 overflow-x-auto overscroll-x-contain border-b border-border [scrollbar-width:none]"
      >
        {boardTabs.map((c) => {
          const isActive = c === tab;
          // The parlay count comes from its own table; the other two are in
          // the tally above. Zero renders as nothing either way.
          const n =
            c === "parlay"
              ? oobeeParlays.length
              : c === "community"
                ? communityParlays.length
                : (countFor.get(c) ?? 0);
          return (
            <Link
              key={c}
              href={
                date === today
                  ? `/picks?category=${c}`
                  : `/picks?date=${date}&category=${c}`
              }
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "relative inline-flex shrink-0 items-center gap-2 whitespace-nowrap px-3 py-2.5 text-sm font-medium transition-colors",
                isActive ? "text-brand" : "text-fg-muted hover:text-fg",
              )}
            >
              {TAB_LABELS[c]}
              {n > 0 && <span className="num text-xs text-fg-subtle">{n}</span>}
              {isActive && (
                <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-brand" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* ------------------------------------------------------- parlay tab */}
      {isCommunityTab ? (
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

          <section aria-labelledby="community-heading">
            <h2 id="community-heading" className="text-sm font-semibold tracking-tight">
              From the community
            </h2>
            {othersShared.length === 0 ? (
              <p className="mt-2 text-sm text-fg-muted">
                Nobody has shared a parlay for this day yet. Build one and be first.
              </p>
            ) : (
              <div className="mt-4 grid gap-3">
                {othersShared.map((pl) => (
                  <ParlayCard key={pl.id} parlay={pl}>
                    {pl.ownerUsername && (
                      <Link
                        href={`/u/${pl.ownerUsername}`}
                        className="flex min-w-0 items-center gap-2 text-xs text-fg-muted hover:text-fg"
                      >
                        <Avatar
                          name={displayNameOf({ displayName: pl.ownerDisplayName, username: pl.ownerUsername })}
                          size="sm"
                          className="size-6 text-[0.625rem]"
                        />
                        <span className="truncate">
                          {displayNameOf({ displayName: pl.ownerDisplayName, username: pl.ownerUsername })}{" "}
                          <span className="text-fg-subtle">@{pl.ownerUsername}</span>
                        </span>
                      </Link>
                    )}
                  </ParlayCard>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : isParlayTab ? (
        <div className="mt-8 space-y-10">
          {/* Oobee's own, ranked like the other two boards. */}
          <section aria-labelledby="oobee-parlays-heading">
            <h2
              id="oobee-parlays-heading"
              className="text-sm font-semibold tracking-tight"
            >
              Oobee parlays
            </h2>
            {oobeeParlays.length === 0 ? (
              <p className="mt-2 text-sm text-fg-muted">
                {date === today
                  ? "None up yet today — they go out with the rest of the board."
                  : "None published for this day."}
              </p>
            ) : (
              <div className="mt-4 grid gap-3">
                {oobeeParlays.map((pl, i) => (
                  <Reveal key={pl.id} delay={Math.min(i * 0.03, 0.2)}>
                    <ParlayCard parlay={pl} featured={pl.rank === 1} />
                  </Reveal>
                ))}
              </div>
            )}
          </section>

          <p className="text-sm text-fg-muted">
            Want your own?{" "}
            <Link
              href={date === today ? "/picks?category=community" : `/picks?date=${date}&category=community`}
              className="text-brand hover:underline"
            >
              Build one on Community parlays
            </Link>{" "}
            from any line on today&apos;s games.
          </p>
        </div>
      ) : view.length === 0 ? (
        <div className="card-hairline mt-8 p-10 text-center">
          <h2 className="text-lg font-semibold tracking-tight">
            {date === today
              ? `No ${CATEGORY_NOUN[category]}s up yet`
              : "Nothing published for this day"}
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-fg-muted">
            {date === today
              ? "Picks go out before the first kick-off. Check back shortly, or flip to the other tab."
              : "Try another date."}
          </p>
        </div>
      ) : (
        <>
          {/* ------------------------------------------------- top pick hero */}
          {top && (
            <div className="mt-8">
              <Reveal>
                <TopPickCard pick={top} follow={followFor(top)} />
              </Reveal>
            </div>
          )}

          {/* ----------------------------------------------------- the board */}
          {rest.length > 0 && (
            <section aria-labelledby="board-heading" className="mt-10">
              <h2 id="board-heading" className="text-sm font-semibold tracking-tight">
                The rest of the board
              </h2>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {rest.map((p, i) => (
                  <Reveal key={p.id} delay={Math.min(i * 0.02, 0.2)}>
                    <PickCard pick={p} follow={followFor(p)} />
                  </Reveal>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
