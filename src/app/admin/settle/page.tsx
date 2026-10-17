import { and, asc, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import type { Metadata } from "next";
import { after } from "next/server";
import { CircleCheck, Clock3, Layers } from "lucide-react";
import { db } from "@/db";
import { games, picks, selections } from "@/db/schema";
import { SettleList } from "@/components/admin/settle-list";
import { CommunityLegList } from "@/components/admin/community-leg-list";
import { getPendingCommunityLegs } from "@/lib/odds/board";
import { countPendingCommunityLegs } from "@/lib/admin/overview";
import { requireAdminPage } from "@/lib/auth";
import { refreshResults } from "@/lib/odds/sync";
import { pickProfit } from "@/lib/settlement";
import { formatUnits } from "@/lib/i18n/format";
import { Empty, Kpi, KpiGrid, PageHeader, TabNav, since } from "@/components/admin/kit";
import { LocalTime } from "@/components/local-time";
import type { Pick } from "@/db/schema";

export const metadata: Metadata = { title: "Settle" };

export const dynamic = "force-dynamic";

const TABS = ["due", "community", "upcoming", "settled"] as const;
/** Work queues show the oldest this many; settling moves the rest up. */
const LIST_CAP = 50;
type Tab = (typeof TABS)[number];

/** Picks under the game they're on, kick-off order. */
function byGame(list: Pick[]) {
  const groups: { key: string; event: string; startsAt: Date; picks: Pick[] }[] = [];
  for (const p of list) {
    const key = `${p.event}|${p.startsAt.toISOString()}`;
    const g = groups.find((x) => x.key === key);
    if (g) g.picks.push(p);
    else groups.push({ key, event: p.event, startsAt: p.startsAt, picks: [p] });
  }
  return groups;
}

export default async function AdminSettlePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const [, params] = await Promise.all([requireAdminPage(), searchParams]);
  const tab: Tab = TABS.includes(params.tab as Tab) ? (params.tab as Tab) : "due";

  // Game lines grade themselves from the final score, and props from the box
  // score. Fetching those is the providers' time, not this page's: it used to
  // be awaited here, so whoever opened Settle after the scores went stale
  // waited on The Odds API (and on BALLDONTLIE, a player at a time). Now it
  // runs after the response, as on every other page, and the results poller
  // grades on its own timer regardless.
  after(refreshResults);

  // eslint-disable-next-line react-hooks/purity -- a server render, once per request: "this week" is the point
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600_000);
  const [communityLegs, legCount, due, [{ n: dueCount }], upcoming, recent, [week]] = await Promise.all([
    getPendingCommunityLegs(LIST_CAP),
    countPendingCommunityLegs(),
    // Started and still pending: needs a result. Oldest first, so the
    // longest-outstanding games get cleared first.
    db
      .select()
      .from(picks)
      .where(sql`${picks.status} = 'pending' and ${picks.startsAt} < now()`)
      .orderBy(asc(picks.startsAt))
      .limit(LIST_CAP),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(picks)
      .where(sql`${picks.status} = 'pending' and ${picks.startsAt} < now()`),
    db
      .select()
      .from(picks)
      .where(sql`${picks.status} = 'pending' and ${picks.startsAt} >= now()`)
      .orderBy(asc(picks.startsAt))
      .limit(40),
    db.select().from(picks).where(isNotNull(picks.settledAt)).orderBy(desc(picks.settledAt)).limit(30),
    db
      .select({
        settled: sql<number>`count(*)::int`,
        auto: sql<number>`count(*) filter (where ${picks.settledBy} is null)::int`,
      })
      .from(picks)
      .where(and(isNotNull(picks.settledAt), gte(picks.settledAt, weekAgo))),
  ]);

  // What the feed says the score was, for picks it couldn't grade itself
  // (props, mostly) — filled into the dialog so it's one click to confirm.
  const selIds = due.flatMap((p) => (p.selectionId ? [p.selectionId] : []));
  const scored = selIds.length
    ? await db
        .select({ id: selections.id, game: games })
        .from(selections)
        .innerJoin(games, eq(games.id, selections.gameId))
        .where(inArray(selections.id, selIds))
    : [];
  const finals = new Map(
    scored
      .filter((s) => s.game.homeScore !== null && s.game.awayScore !== null)
      .map((s) => [s.id, `${s.game.awayTeam} ${s.game.awayScore}–${s.game.homeScore} ${s.game.homeTeam}`]),
  );
  const scores = Object.fromEntries(
    due.flatMap((p) => (p.selectionId && finals.has(p.selectionId) ? [[p.id, finals.get(p.selectionId)!]] : [])),
  );

  const recentNet = recent
    .filter((p) => p.settledAt && p.settledAt >= weekAgo)
    .reduce((n, p) => n + pickProfit(p), 0);

  const tabs = [
    { href: "/admin/settle", label: "Needs a result", count: dueCount, active: tab === "due", attention: true },
    { href: "/admin/settle?tab=community", label: "Parlay legs", count: legCount, active: tab === "community", attention: true },
    { href: "/admin/settle?tab=upcoming", label: "Not started", count: upcoming.length, active: tab === "upcoming" },
    { href: "/admin/settle?tab=settled", label: "Recently settled", active: tab === "settled" },
  ];

  return (
    <div>
      <PageHeader
        title="Settle"
        description="Results the feed couldn't record for itself. Everything you settle goes on the public record at once."
        info={
          <>
            Game bets settle themselves from the final score, and NFL player props from the box score a few hours after
            the game. What&apos;s left here is a prop the stats feed couldn&apos;t match to one player, a player who
            didn&apos;t play, hand-entered picks from before the feed, and corrections. Settling a leg grades every
            parlay it&apos;s in. Every result is written to the activity log.
          </>
        }
      />

      <KpiGrid className="mb-6">
        <Kpi
          label="Needs a result"
          value={dueCount}
          tone={dueCount > 0 ? "brand" : "neutral"}
          sub={due[0] ? `oldest kicked off ${since(due[0].startsAt)}` : "nothing waiting"}
          href="/admin/settle"
        />
        <Kpi
          label="Parlay legs"
          value={legCount}
          tone={legCount > 0 ? "brand" : "neutral"}
          sub={communityLegs[0] ? `oldest kicked off ${since(communityLegs[0].commenceTime)}` : "nothing waiting"}
          href="/admin/settle?tab=community"
        />
        <Kpi
          label="Not started"
          value={upcoming.length}
          sub={upcoming[0] ? <>next <LocalTime at={upcoming[0].startsAt} format="kickoff" /></> : "nothing pending"}
          href="/admin/settle?tab=upcoming"
        />
        <Kpi
          label="Settled this week"
          value={week.settled}
          sub={
            week.settled > 0 ? (
              <>
                {week.auto} by the grader · {formatUnits(recentNet)}
              </>
            ) : (
              "none yet"
            )
          }
          href="/admin/settle?tab=settled"
        />
      </KpiGrid>

      <TabNav label="Settle lists" tabs={tabs} />

      {tab === "due" &&
        (due.length === 0 ? (
          <Empty icon={CircleCheck} title="You're up to date">
            Every pick that has started has a result.
          </Empty>
        ) : (
          <div className="space-y-6">
            {dueCount > due.length && (
              <p className="text-xs text-fg-subtle">
                The oldest {due.length} of {dueCount}. Settle these and the rest move up.
              </p>
            )}
            {byGame(due).map((g) => (
              <section key={g.key} aria-label={g.event}>
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <h2 className="text-sm font-semibold tracking-tight text-fg">{g.event}</h2>
                  <p className="text-xs text-fg-subtle">
                    <LocalTime at={g.startsAt} format="datetime" /> · started {since(g.startsAt)}
                    {g.picks[0].selectionId && finals.has(g.picks[0].selectionId) && (
                      <span className="text-fg-muted"> · Final {finals.get(g.picks[0].selectionId)}</span>
                    )}
                  </p>
                </div>
                <SettleList picks={g.picks} emptyMessage="" scores={scores} hideEvent />
              </section>
            ))}
          </div>
        ))}

      {tab === "community" &&
        (communityLegs.length === 0 ? (
          <Empty icon={Layers} title="No community legs waiting">
            Props in testers&apos; parlays that the box score can&apos;t grade show up here.
          </Empty>
        ) : (
          <>
            {legCount > communityLegs.length && (
              <p className="mb-3 text-xs text-fg-subtle">
                The oldest {communityLegs.length} of {legCount}. Settle these and the rest move up.
              </p>
            )}
            <CommunityLegList legs={communityLegs} />
          </>
        ))}

      {tab === "upcoming" &&
        (upcoming.length === 0 ? (
          <Empty icon={Clock3} title="Nothing pending" />
        ) : (
          <>
            <p className="mb-3 text-xs text-fg-subtle">Not kicked off yet. Results open at kick-off; a postponed or cancelled game can be voided now.</p>
            <SettleList picks={upcoming} emptyMessage="" muted upcoming />
          </>
        ))}

      {tab === "settled" &&
        (recent.length === 0 ? (
          <Empty icon={CircleCheck} title="Nothing settled yet" />
        ) : (
          <>
            <p className="mb-3 text-xs text-fg-subtle">
              The last {recent.length}. Reopening a settled pick takes it off the record until it&apos;s settled again —
              it&apos;s logged.
            </p>
            <SettleList picks={recent} emptyMessage="" settled />
          </>
        ))}
    </div>
  );
}
