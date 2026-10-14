import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { after } from "next/server";
import { ArrowLeft } from "lucide-react";
import { getAuth } from "@/lib/auth";
import {
  SEASON_TYPE_LABELS,
  columnByKey,
  formatStat,
  leagueFromKey,
  seasonLabel,
  seasonTypeFromParam,
  type SeasonType,
} from "@/lib/players/catalog";
import { statsConfigured } from "@/lib/players/balldontlie";
import { getGameLog, getPlayer, getPlayerSeasons } from "@/lib/players/queries";
import { ensureGameLog } from "@/lib/players/sync";
import { SPORT_EMOJI } from "@/components/pick-card";
import { LocalTime } from "@/components/local-time";
import { SocialShell } from "@/components/social/social-shell";
import { StatCell } from "@/components/stat-cell";
import { FilterPill } from "@/components/players/filter-pill";
import { SeasonPicker } from "@/components/players/season-picker";
import { StatsGrid, type GridRow } from "@/components/players/stats-grid";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Params = { league: string; id: string };
type Search = { season?: string; type?: string; cat?: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { league, id } = await params;
  const player = await getPlayer(`${league}:${id}`);
  return { title: player ? player.name : "Player", robots: { index: false, follow: false } };
}

/**
 * One player: the headline numbers for a season, every season we hold for
 * them, and their recent games — what you'd look at before a player prop.
 * The game log is fetched for this player when the page is opened (after the
 * response, so nobody waits); until it arrives the page says so.
 */
export default async function PlayerPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const [auth, { league: leagueKey, id }, search] = await Promise.all([getAuth(), params, searchParams]);
  const league = leagueFromKey(leagueKey);
  if (!league) notFound();
  const playerId = `${league.key}:${id}`;
  if (!auth) redirect(`/login?next=/players/${league.key}/${encodeURIComponent(id)}`);

  const [player, seasons] = await Promise.all([getPlayer(playerId), getPlayerSeasons(playerId)]);
  if (!player) notFound();

  const type = seasonTypeFromParam(search.type);
  const ofType = seasons.filter((s) => s.type === type);
  const allSeasons = [...new Set(seasons.map((s) => s.season))];
  const asked = Number(search.season);
  const season = allSeasons.includes(asked) ? asked : (ofType[0]?.season ?? allSeasons[0] ?? null);
  const row = ofType.find((s) => s.season === season) ?? null;

  // The tables this player has numbers in — a quarterback's Passing and Rushing.
  const mine = league.categories.filter((c) => seasons.some((s) => (s.stats[c.has] ?? 0) > 0));
  const choices = mine.length > 0 ? mine : [league.categories[0]];
  const category = choices.find((c) => c.key === search.cat) ?? choices[0];

  if (season !== null) after(() => ensureGameLog(playerId, season));
  const games = season === null ? [] : (await getGameLog(playerId, season, 40)).filter((g) => g.seasonType === type).slice(0, 15);

  const label = (s: number) => seasonLabel(league, s);
  const href = (change: { season?: number; type?: SeasonType; cat?: string }) => {
    const p = new URLSearchParams();
    const s = change.season ?? season;
    if (s !== null) p.set("season", String(s));
    const t = change.type ?? type;
    if (t !== "regular") p.set("type", t);
    const c = change.cat ?? category.key;
    if (c !== choices[0].key) p.set("cat", c);
    return `/players/${league.key}/${encodeURIComponent(id)}?${p}`;
  };
  const backHref = `/players?sport=${league.key}${season !== null ? `&season=${season}` : ""}${category.key !== league.categories[0].key ? `&cat=${category.key}` : ""}`;
  const team = row?.teamAbbr ?? player.teamAbbr;
  const facts = [team, player.position, player.jersey ? `#${player.jersey}` : null].filter(Boolean).join(" · ");

  return (
    <SocialShell>
      <div className="flex items-center gap-4 px-4 py-2.5">
        <Link
          href={backHref}
          aria-label={`Back to ${league.label} players`}
          className="grid size-9 shrink-0 place-items-center rounded-full transition-colors hover:bg-surface-2"
        >
          <ArrowLeft className="size-5" aria-hidden="true" />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold">{player.name}</h1>
          <p className="truncate text-sm text-fg-subtle">
            <span aria-hidden="true">{SPORT_EMOJI[league.sport]}</span> {league.label}
            {facts && ` · ${facts}`}
          </p>
        </div>
      </div>

      {/* ------------------------------------------------- season and type */}
      <div className="flex flex-wrap items-center gap-2 border-y border-border px-4 py-3">
        {allSeasons.length > 0 && season !== null && (
          <SeasonPicker
            current={label(season)}
            options={allSeasons.map((s) => ({ label: label(s), href: href({ season: s }), active: s === season }))}
          />
        )}
        <nav aria-label="Season type" className="flex gap-2">
          {(["regular", "postseason"] as SeasonType[]).map((t) => (
            <FilterPill key={t} href={href({ type: t })} on={type === t}>
              {SEASON_TYPE_LABELS[t]}
            </FilterPill>
          ))}
        </nav>
      </div>

      {/* -------------------------------------------------------- headline */}
      {row ? (
        <dl className="grid grid-cols-2 border-b border-border">
          {category.headline.map((key) => {
            const col = columnByKey(league, key);
            return (
              <StatCell
                key={key}
                label={col?.title ?? key}
                value={formatStat(row.stats[key], col?.format ?? "int")}
              />
            );
          })}
        </dl>
      ) : (
        <Empty>
          {season === null
            ? "No numbers on file for this player yet."
            : type === "postseason"
              ? `No playoff games in ${label(season)}.`
              : `No ${label(season)} numbers yet.`}
        </Empty>
      )}

      {/* --------------------------------------------------- table choice */}
      {choices.length > 1 && (
        <nav aria-label="Table" className="flex gap-2 overflow-x-auto border-b border-border px-4 py-3 [scrollbar-width:none]">
          {choices.map((c) => (
            <FilterPill key={c.key} href={href({ cat: c.key })} on={c.key === category.key}>
              {c.label}
            </FilterPill>
          ))}
        </nav>
      )}

      {/* -------------------------------------------------------- by season */}
      <Section title="By season" sub={SEASON_TYPE_LABELS[type]}>
        {ofType.length > 0 ? (
          <StatsGrid
            label={`${player.name}, ${category.label.toLowerCase()} by season`}
            leadLabel="Season"
            columns={category.columns}
            rows={ofType.map((s) => ({
              id: `${s.season}`,
              lead: (
                <>
                  <span className={cn("num block text-sm font-semibold", s.season === season ? "text-brand" : "text-fg")}>
                    {label(s.season)}
                  </span>
                  {s.teamAbbr && <span className="block text-xs text-fg-subtle">{s.teamAbbr}</span>}
                </>
              ),
              stats: s.stats,
            }))}
          />
        ) : (
          <Empty>No {SEASON_TYPE_LABELS[type].toLowerCase()} seasons on file.</Empty>
        )}
      </Section>

      {/* --------------------------------------------------------- game log */}
      {season !== null && (
        <Section title="Game log" sub={`${label(season)} · last ${games.length || 15}`}>
          {games.length > 0 ? (
            <StatsGrid
              label={`${player.name}, ${label(season)} game log`}
              leadLabel="Game"
              columns={category.gameColumns}
              rows={games.map(gameRow)}
            />
          ) : (
            <Empty>
              {statsConfigured() ? "Recent games are on their way — check back in a moment." : "No games on file."}
            </Empty>
          )}
        </Section>
      )}
    </SocialShell>
  );
}

type Game = Awaited<ReturnType<typeof getGameLog>>[number];

/** A game's pinned cell: the date and opponent, then the result in words and colour. */
function gameRow(g: Game): GridRow {
  const won = g.teamScore !== null && g.opponentScore !== null ? g.teamScore > g.opponentScore : null;
  const tied = g.teamScore !== null && g.teamScore === g.opponentScore;
  return {
    id: g.gameId,
    lead: (
      <>
        <span className="block truncate text-sm text-fg">
          <LocalTime at={g.playedAt} format="date" year="2-digit" />
          {g.opponentAbbr && (
            <span className="text-fg-muted">
              {" "}
              · {g.home === false ? "@" : "vs"} {g.opponentAbbr}
            </span>
          )}
        </span>
        {g.teamScore !== null && g.opponentScore !== null && (
          <span className={cn("num block text-xs font-medium", tied ? "text-fg-subtle" : won ? "text-hit" : "text-miss")}>
            {tied ? "T" : won ? "W" : "L"} {g.teamScore}–{g.opponentScore}
          </span>
        )}
      </>
    ),
    stats: g.stats,
  };
}

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-border">
      <h2 className="flex items-baseline justify-between gap-3 px-4 pb-2 pt-4 text-base font-bold tracking-tight">
        {title}
        {sub && <span className="num text-xs font-normal tracking-normal text-fg-subtle">{sub}</span>}
      </h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-8 text-center text-sm text-fg-muted">{children}</p>;
}
