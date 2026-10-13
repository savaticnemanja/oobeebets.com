import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { picks, slates } from "@/db/schema";
import { PickComposer } from "@/components/admin/pick-composer";
import { requireAdminPage } from "@/lib/auth";
import { getSlateGames } from "@/lib/odds/board";
import { ensureSlateOdds, getFeedStatus } from "@/lib/odds/sync";
import { SlatePickList } from "@/components/admin/slate-pick-list";
import { PublishBar } from "@/components/admin/publish-bar";
import { isValidSlateDate, slateDateString } from "@/lib/slate-date";
import {
  PARLAYS_PER_SLATE,
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
import { cn } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Publish slate" };

export const dynamic = "force-dynamic";

export default async function AdminSlatePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; category?: string }>;
}) {
  await requireAdminPage();
  const params = await searchParams;
  const date =
    params.date && isValidSlateDate(params.date) ? params.date : slateDateString();
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

  // Oobee's parlays are a different table, so only the parlay tab pays for
  // them. `legs` is what the composer may build from — this slate's picks that
  // are published-or-draft and still ahead of kick-off.
  const [oobeeParlays, legs] = isParlayTab
    ? await Promise.all([getOobeeParlays(date), selectableLegs(date)])
    : [[], []];

  // The pick composer chooses from the odds feed. Refreshed here only when
  // the stored copy is stale, so reloading this screen does not spend credits.
  if (!isParlayTab && !published) await ensureSlateOdds(date);
  const [games, feed] =
    !isParlayTab && !published
      ? await Promise.all([getSlateGames(date), getFeedStatus()])
      : [[], null];

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Publish slate</h1>
      <p className="mt-1.5 text-sm text-fg-muted">
        Two boards, ranked separately. Add picks in any order, then drag rows below
        to set the final rank; star any you want featured — they lead their day on
        the board, as many as you like, even after publishing. All{" "}
        {PICKS_PER_SLATE.game} game bets and {PICKS_PER_SLATE.prop} player props go
        out free to every tester, and both publish together.
      </p>

      <PublishBar
        date={date}
        category={category}
        published={published}
        counts={counts}
        anySettled={rows.some((r) => r.settledAt !== null)}
        // eslint-disable-next-line react-hooks/purity -- a server render, once per request: "has a game started yet" is the point
        anyStarted={rows.some((r) => r.startsAt.getTime() <= Date.now())}
      />

      {/* ---------------------------------------------------------- category */}
      <nav
        aria-label="Board"
        className="mt-6 -mb-px flex items-center gap-1 border-b border-border"
      >
        {adminBoardTabs.map((c) => {
          const isActive = c === tab;
          const [have, limit] =
            c === "parlay"
              ? [oobeeParlays.length, PARLAYS_PER_SLATE]
              : [counts[c], PICKS_PER_SLATE[c]];
          return (
            <Link
              key={c}
              href={`/admin/slate?date=${date}&category=${c}`}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "relative inline-flex items-center gap-2 px-3 py-2.5 text-sm font-medium transition-colors",
                isActive ? "text-brand" : "text-fg-muted hover:text-fg",
              )}
            >
              {TAB_LABELS[c]}
              <span className="num text-xs text-fg-subtle">
                {have}/{limit}
              </span>
              {isActive && (
                <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-brand" />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-32 lg:self-start">
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
  );
}
