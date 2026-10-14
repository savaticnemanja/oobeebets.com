import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { Search } from "lucide-react";
import { getAuth } from "@/lib/auth";
import { SPORT_FILTERS } from "@/lib/board";
import { LEAGUES, SEASON_TYPE_LABELS, leagueFromParam, seasonLabel, type SeasonType } from "@/lib/players/catalog";
import { statsConfigured } from "@/lib/players/balldontlie";
import { getSeasons, lastSynced } from "@/lib/players/queries";
import { ensureSeason } from "@/lib/players/sync";
import { LoadMore } from "@/components/load-more";
import { LocalTime } from "@/components/local-time";
import { SportPills } from "@/components/board/sport-pills";
import { FeedTabs } from "@/components/social/feed";
import { SocialShell } from "@/components/social/social-shell";
import { InfoTip } from "@/components/ui/info-tip";
import { FilterPill } from "@/components/players/filter-pill";
import { SeasonPicker } from "@/components/players/season-picker";
import { StatsGrid } from "@/components/players/stats-grid";
import { loadPlayersAction } from "@/app/actions/feeds";
import { playersHref, resolveView, sortHref, tableRows, type PlayersParams } from "../view";

export const metadata: Metadata = {
  title: "Players",
  description: "Player stats for the NFL, NBA, MLB and NHL, season by season.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** The sports Players has tables for, in the board's order. */
const FILTERS = SPORT_FILTERS.filter((f) => LEAGUES.some((l) => l.key === f.key));

/**
 * Players: every player's numbers for a season, one league at a time — the
 * table you check before taking a player prop. Laid out like Picks: sport
 * pills on top, the league's tables as tabs, then the filters (season first)
 * and the table, sortable by any column and loaded fifty
 * rows at a time as you scroll. Tap a row for the player's own page.
 *
 * The numbers come from the stats feed by way of the database
 * (lib/players/sync.ts); nothing here waits on the provider.
 */
export default async function PlayersPage({ searchParams }: { searchParams: Promise<PlayersParams> }) {
  const [auth, params] = await Promise.all([getAuth(), searchParams]);
  if (!auth) redirect("/login?next=/players");

  const seasons = await getSeasons(leagueFromParam(params.sport).league);
  const view = resolveView(params, seasons);
  const held = seasons.find((s) => s.season === view.season);
  const hasRows = held?.types.includes(view.type) ?? false;

  // Keep the season on screen fresh even with the poller off — after the
  // response, and only when it's due (sync.ts claims it first).
  after(() => ensureSeason(view.league.league, view.season, view.type));

  const [{ rows, next }, synced] = await Promise.all([
    hasRows ? tableRows(view, 0) : Promise.resolve({ rows: [], next: null }),
    lastSynced(view.league.league),
  ]);
  const label = (s: number) => seasonLabel(view.league, s);
  const active = FILTERS.find((f) => f.key === view.league.key) ?? null;

  return (
    <SocialShell>
      {/* The page is named by the nav; the heading is for screen readers. */}
      <h1 className="sr-only">Players</h1>

      <SportPills
        active={active}
        hrefFor={(key) => `/players?sport=${key}`}
        below="bar-tabs"
        filters={FILTERS}
        withAll={false}
        actions={
          <InfoTip label="About player stats">
            <p>
              Every player&apos;s numbers for the season, from our stats feed
              {synced ? (
                <>
                  {" "}
                  — last updated <LocalTime at={synced} format="ago" />
                </>
              ) : null}
              . Tap a column to sort by it, and a player for their seasons and recent games.
            </p>
            <p>
              <strong className="font-semibold text-fg">Qualified</strong> keeps the players with a real
              sample: at least {Math.round(view.category.qualify.share * 100)}% of the table&apos;s most{" "}
              {(view.category.columns.find((c) => c.key === view.category.qualify.key)?.title ?? "games").toLowerCase()}.
            </p>
          </InfoTip>
        }
      />

      {/* The league's tables, stuck under the pills. */}
      <FeedTabs
        label="Table"
        sticky="top-[calc(3.5rem+1px+3.5rem+var(--spacing-safe-top)-var(--chrome-hide,0px)-var(--chrome-p,0)*6.5625rem)] sm:top-14"
        active={view.category.key}
        tabs={view.league.categories.map((c) => ({
          key: c.key,
          label: c.label,
          href: playersHref(view, { category: c }),
        }))}
      />

      {/* ------------------------------------------------------------ filters */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        {seasons.length > 0 && (
          <SeasonPicker
            current={label(view.season)}
            options={seasons.map((s) => ({
              label: label(s.season),
              href: playersHref(view, { season: s.season }),
              active: s.season === view.season,
            }))}
          />
        )}
        <nav aria-label="Season type" className="flex gap-2">
          {(["regular", "postseason"] as SeasonType[]).map((t) => (
            <FilterPill key={t} href={playersHref(view, { type: t })} on={view.type === t}>
              {SEASON_TYPE_LABELS[t]}
            </FilterPill>
          ))}
        </nav>
        <span className="hidden h-5 w-px bg-border sm:block" aria-hidden="true" />
        <nav aria-label="Who to show" className="flex gap-2">
          <FilterPill href={playersHref(view, { qualified: true })} on={view.qualified}>
            Qualified
          </FilterPill>
          <FilterPill href={playersHref(view, { qualified: false })} on={!view.qualified}>
            All players
          </FilterPill>
        </nav>
        <form action="/players" role="search" className="relative basis-full sm:min-w-40 sm:flex-1 sm:basis-auto">
          <input type="hidden" name="sport" value={view.league.key} />
          <input type="hidden" name="season" value={view.season} />
          {view.type !== "regular" && <input type="hidden" name="type" value={view.type} />}
          {view.category.key !== view.league.categories[0].key && <input type="hidden" name="cat" value={view.category.key} />}
          {!view.qualified && <input type="hidden" name="all" value="1" />}
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" aria-hidden="true" />
          <input
            type="search"
            name="q"
            defaultValue={view.q}
            placeholder="Search players"
            aria-label="Search players"
            enterKeyHint="search"
            className="h-9 w-full rounded-full border border-border bg-surface pl-9 pr-3 text-sm text-fg transition-colors placeholder:text-fg-subtle hover:border-border-strong focus:border-brand/60 focus:bg-surface-2 focus:outline-none touch:text-base"
          />
        </form>
      </div>

      {/* -------------------------------------------------------------- table */}
      {rows.length > 0 ? (
        <>
          <StatsGrid
            label={`${view.league.label} ${view.category.label.toLowerCase()}, ${label(view.season)} ${SEASON_TYPE_LABELS[view.type].toLowerCase()}`}
            leadLabel="Player"
            columns={view.category.columns}
            rows={rows}
            rank={!view.q}
            sort={{ key: view.sort.key, dir: view.dir, href: (key) => sortHref(view, key) }}
            more={
              <LoadMore
                key={playersHref(view)}
                next={next === null ? null : String(next)}
                load={loadPlayersAction.bind(null, playersHref(view))}
              />
            }
          />
          {next === null && <SmallPrint synced={synced} />}
        </>
      ) : (
        <Empty>
          {seasons.length === 0 ? (
            statsConfigured() ? (
              <>The first {view.league.label} numbers are on their way — they arrive a few minutes after the feed is switched on.</>
            ) : (
              <>Player stats aren&apos;t switched on yet.</>
            )
          ) : view.q ? (
            <>
              No {view.league.label} player matches &ldquo;{view.q}&rdquo; in {label(view.season)}.{" "}
              <Link href={playersHref(view, { q: "" })} className="text-brand hover:underline">
                Clear the search
              </Link>
            </>
          ) : hasRows ? (
            <>
              Nobody qualifies yet.{" "}
              <Link href={playersHref(view, { qualified: false })} className="text-brand hover:underline">
                Show all players
              </Link>
            </>
          ) : (
            <NotYet view={view} seasons={seasons} label={label} />
          )}
        </Empty>
      )}
    </SocialShell>
  );
}

/** A season (or its playoffs) with nothing in it yet, and where to look instead. */
function NotYet({
  view,
  seasons,
  label,
}: {
  view: ReturnType<typeof resolveView>;
  seasons: Array<{ season: number; types: SeasonType[] }>;
  label: (s: number) => string;
}) {
  const fallback = seasons.find((s) => s.season !== view.season && s.types.includes(view.type));
  const what = view.type === "postseason" ? `No playoff games in ${label(view.season)} yet.` : `The ${label(view.season)} season hasn't started yet.`;
  return (
    <>
      {what}
      {fallback && (
        <>
          {" "}
          <Link href={playersHref(view, { season: fallback.season })} className="text-brand hover:underline">
            See {label(fallback.season)}
            {view.type === "postseason" ? " playoffs" : ""}
          </Link>
        </>
      )}
    </>
  );
}

function SmallPrint({ synced }: { synced: Date | null }) {
  return (
    <p className="px-4 py-4 text-xs text-fg-subtle">
      Stats from BALLDONTLIE
      {synced && (
        <>
          {" "}
          · updated <LocalTime at={synced} format="ago" />
        </>
      )}
    </p>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-10 text-center text-sm text-fg-muted">{children}</p>;
}
