import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { picks, slates } from "@/db/schema";
import { PickComposer } from "@/components/admin/pick-composer";
import { requireAdminPage } from "@/lib/auth";
import { UPCOMING_DAYS, getSlateGames, nextGameDay } from "@/lib/odds/board";
import { ensureSlateOdds, ensureUpcomingOdds, getFeedStatus, slateBounds } from "@/lib/odds/sync";
import { formatSlateDate, formatSlateWeekday } from "@/lib/i18n/format";
import { SlatePickList } from "@/components/admin/slate-pick-list";
import { PublishPanel } from "@/components/admin/publish-bar";
import { SlateDays } from "@/components/admin/slate-days";
import { PageHeader, TabNav } from "@/components/admin/kit";
import { getSlateDays } from "@/lib/admin/overview";
import { addDays } from "@/lib/slate-date";
import { isValidSlateDate, slateDateString } from "@/lib/slate-date";
import {
  PICKS_PER_SLATE,
  TAB_LABELS,
  adminBoardTabs,
  categoryFromParam,
  pickCategories,
  tabFromParam,
  type PickCategory,
} from "@/lib/board";
import { getOobeeParlays, selectableLegs } from "@/lib/parlay-store";
import { ParlayComposer } from "@/components/admin/parlay-composer";
import { ParlayCard } from "@/components/parlay-card";
import { DeleteOobeeParlayButton } from "@/components/admin/parlay-delete";
import { FeatureToggle } from "@/components/admin/feature-toggle";
import { CalendarX2 } from "lucide-react";
import type { Metadata } from "next";
import { after } from "next/server";

export const metadata: Metadata = { title: "Publish slate" };

export const dynamic = "force-dynamic";

/**
 * How long the builder waits on the odds feed. The provider used to be
 * awaited outright — 2–4s whenever the stored lines had gone stale, and up to
 * 10s a call when it was down (admin perf audit, 2026-10-17). Past this the
 * page shows the lines on file and the refresh finishes in after(); the price
 * is checked again when a pick is added (freezeLine).
 */
const FEED_WAIT_MS = 1500;

/** Waits up to `ms` for `work`; if it takes longer, lets it finish after the response. */
async function within(work: Promise<unknown>, ms: number): Promise<void> {
  const done = work.then(
    () => false,
    () => false,
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = await Promise.race([done, new Promise<boolean>((resolve) => (timer = setTimeout(() => resolve(true), ms)))]);
  clearTimeout(timer);
  if (late) after(() => done);
}

export default async function AdminSlatePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; category?: string }>;
}) {
  await requireAdminPage();
  const params = await searchParams;
  // With no date asked for, open the next day that still has a game to pick
  // from: NFL plays on a few days a week, and today is often not one of them.
  let date: string;
  if (params.date && isValidSlateDate(params.date)) {
    date = params.date;
  } else {
    await within(ensureUpcomingOdds(UPCOMING_DAYS), FEED_WAIT_MS);
    date = (await nextGameDay(new Date())) ?? slateDateString();
  }
  const requestedTab = tabFromParam(params.category);
  const tab = requestedTab === "community" ? "game" : requestedTab;
  const isParlayTab = tab === "parlay";
  const category = categoryFromParam(params.category);

  const [slateRow, rows] = await Promise.all([
    db.select().from(slates).where(eq(slates.date, date)).limit(1),
    db.select().from(picks).where(eq(picks.slateDate, date)).orderBy(asc(picks.rank)),
  ]);

  const slate = slateRow[0] ?? null;
  const published = Boolean(slate?.publishedAt);

  // One query for the day, split here. Both counts are needed for the publish
  // bar regardless of which tab is open, so fetching per-tab would mean two
  // round trips to render one screen.
  const byCategory = Object.fromEntries(
    pickCategories.map((c) => [c, rows.filter((r) => r.category === c)]),
  ) as Record<PickCategory, typeof rows>;

  const counts = Object.fromEntries(
    pickCategories.map((c) => [c, byCategory[c].length]),
  ) as Record<PickCategory, number>;

  // Oobee's parlays go out with the day, so the panel counts them on every
  // tab; `legs` — what the parlay composer may build from, this slate's picks
  // still ahead of kick-off — only on the parlay tab.
  //
  // The day strip covers the coming week and a little behind; a day picked
  // from further off gets its own few days either side instead.
  const today = slateDateString();
  const [from, to] =
    date >= addDays(today, -2) && date <= addDays(today, 9)
      ? [addDays(today, -2), addDays(today, 9)]
      : [addDays(date, -3), addDays(date, 3)];
  const [oobeeParlays, legs, days] = await Promise.all([
    getOobeeParlays(date),
    isParlayTab ? selectableLegs(date) : [],
    getSlateDays(from, to),
  ]);

  // The pick composer chooses from the odds feed. Refreshed here only when
  // the stored copy is stale, so reloading this screen does not spend credits.
  // A day inside the coming week is covered by the week's call — the same one
  // the parlay builder makes, at the same cost — so it isn't fetched twice.
  if (!isParlayTab && !published) {
    // eslint-disable-next-line react-hooks/purity -- a server render, once per request: "is it inside the coming week" is the point
    const weekEnd = Date.now() + UPCOMING_DAYS * 24 * 3600_000;
    await within(
      slateBounds(date).to.getTime() <= weekEnd ? ensureUpcomingOdds(UPCOMING_DAYS) : ensureSlateOdds(date),
      FEED_WAIT_MS,
    );
  }
  const [games, feed] =
    !isParlayTab && !published
      ? await Promise.all([getSlateGames(date), getFeedStatus()])
      : [[], null];
  // Nothing left to pick on this day: point at the next day that has a game.
  const nextDay =
    !isParlayTab && !published && games.length === 0
      // eslint-disable-next-line react-hooks/purity -- a server render, once per request: "what hasn't kicked off yet" is the point
      ? await nextGameDay(new Date(Math.max(slateBounds(date).from.getTime(), Date.now())))
      : null;

  // eslint-disable-next-line react-hooks/purity -- a server render, once per request: "has a game started yet" is the point
  const now = Date.now();
  const firstKickoff =
    rows.length > 0
      ? new Date(Math.min(...rows.map((r) => r.startsAt.getTime())))
      : (days.find((d) => d.day === date)?.firstKickoff ?? null);

  return (
    <div>
      <PageHeader
        title="Publish slate"
        description="Choose a game day, add picks from the odds feed, put them in order, then publish the day."
        info={
          <>
            Game bets and player props are two boards, ranked separately: add picks in any order, then drag rows to set
            the final rank. Each game day takes up to {PICKS_PER_SLATE.game} game bets and {PICKS_PER_SLATE.prop} player
            props — as many as its games are worth, so a one-game Thursday can go out short. Star any you want featured:
            they lead their day on the board, as many as you like, even after publishing. Everything on the day publishes
            together, and only before its first game.
          </>
        }
      />

      <SlateDays
        days={days.map(({ day, games, published, picks, parlays }) => ({ day, games, published, picks, parlays }))}
        current={date}
        today={today}
        category={tab}
      />

      <PublishPanel
        date={date}
        dayLabel={`${formatSlateWeekday(date)}, ${formatSlateDate(date).replace(/^\w+, /, "")}`}
        published={published}
        publishedAt={slate?.publishedAt ?? null}
        counts={counts}
        parlays={oobeeParlays.length}
        featured={rows.filter((r) => r.featured).length + oobeeParlays.filter((p) => p.featured).length}
        firstKickoff={firstKickoff}
        anySettled={rows.some((r) => r.settledAt !== null)}
        anyStarted={rows.some((r) => r.startsAt.getTime() <= now)}
      />

      {nextDay && nextDay !== date && (
        <p className="mb-6 flex items-center gap-2 rounded-xl border border-border px-4 py-3 text-sm text-fg-muted">
          <CalendarX2 className="size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
          <span>
            No games left to pick on {formatSlateDate(date)}. Next game day:{" "}
            <Link href={`/admin/slate?date=${nextDay}&category=${category}`} className="text-brand hover:underline">
              {formatSlateDate(nextDay)}
            </Link>
            .
          </span>
        </p>
      )}

      <TabNav
        label="Board"
        className="mb-6"
        tabs={adminBoardTabs.map((c) => ({
          href: `/admin/slate?date=${date}&category=${c}`,
          label: TAB_LABELS[c],
          count: c === "parlay" ? oobeeParlays.length : counts[c],
          active: c === tab,
        }))}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-6 lg:self-start">
          {isParlayTab ? (
            <ParlayComposer
              date={date}
              legs={legs}
              parlayCount={oobeeParlays.length}
              disabled={published}
            />
          ) : (
            <PickComposer
              date={date}
              category={category}
              pickCount={counts[category]}
              disabled={published}
              games={games}
              feed={feed ?? { configured: false, creditsRemaining: null, lastError: null }}
            />
          )}
        </div>

        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold tracking-tight">On the board</h2>
            <p className="text-xs text-fg-subtle">
              {published
                ? "Published — the order is fixed; stars still work"
                : isParlayTab
                  ? "Built from this day's picks"
                  : "Drag a row to change its rank · ★ to feature"}
            </p>
          </div>
        {isParlayTab ? (
          <div>
            {oobeeParlays.length === 0 ? (
              <div className="card-hairline p-8 text-center text-sm text-fg-muted">
                No parlays on this slate yet.
              </div>
            ) : (
              <div className="grid gap-3">
                {oobeeParlays.map((p) => (
                  <ParlayCard key={p.id} parlay={p} featured={p.featured}>
                    <div className="flex items-center gap-1">
                      <FeatureToggle kind="parlay" id={p.id} featured={p.featured} withLabel />
                      {/* Published parlays are immutable, like published picks:
                          settling their legs is what grades them. */}
                      {!published && <DeleteOobeeParlayButton parlayId={p.id} />}
                    </div>
                  </ParlayCard>
                ))}
              </div>
            )}
          </div>
        ) : (
          <SlatePickList
            date={date}
            category={category}
            picks={byCategory[category]}
            published={published}
          />
        )}
        </div>
      </div>
    </div>
  );
}
