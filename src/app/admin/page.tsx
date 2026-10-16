import Link from "next/link";
import type { Metadata } from "next";
import {
  CalendarCheck,
  CircleCheck,
  CircleCheckBig,
  Flag,
  Hourglass,
  Layers,
  MessageSquareText,
  RadioTower,
  type LucideIcon,
} from "lucide-react";
import { requireAdminPage } from "@/lib/auth";
import { getTrackRecord } from "@/lib/stats";
import { nextGameDay } from "@/lib/odds/board";
import { feedConfigured } from "@/lib/odds/sync";
import { statsConfigured } from "@/lib/players/balldontlie";
import { slateDateString } from "@/lib/slate-date";
import { CATEGORY_LABELS, PARLAYS_PER_SLATE, PICKS_PER_SLATE, pickCategories } from "@/lib/board";
import { formatRate, formatSlateDate, formatSlateWeekday, formatUnits } from "@/lib/i18n/format";
import {
  countPendingCommunityLegs,
  getFeedHealth,
  getNewestAccounts,
  getPulse,
  getQueues,
  getRecordByDay,
  getSlateSummary,
  getTopMembers,
} from "@/lib/admin/overview";
import { getActivity } from "@/lib/admin/activity";
import { Kpi, KpiGrid, Panel, PanelLink, PageHeader, since } from "@/components/admin/kit";
import { ColumnChart, MiniColumns } from "@/components/admin/charts";
import { ActivityList } from "@/components/admin/activity-list";
import { Avatar } from "@/components/social/identity";
import { LocalTime } from "@/components/local-time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MIN_SAMPLE_FOR_RATE } from "@/lib/settlement";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Overview" };

export const dynamic = "force-dynamic";

interface Task {
  key: string;
  icon: LucideIcon;
  title: React.ReactNode;
  detail?: React.ReactNode;
  href: string;
  cta: string;
  /** Blocks testers (a result, a report) rather than merely waiting. */
  urgent?: boolean;
}

/** "Oct 3" for a chart's x axis. */
function shortDay(day: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${day}T12:00:00Z`),
  );
}

export default async function AdminOverviewPage() {
  await requireAdminPage();
  const now = new Date();
  const today = slateDateString(now);
  // The slate to work on: the next day with a game still to come — where the
  // builder opens too. On a day without games that's the next game day.
  const day = (await nextGameDay(now)) ?? today;

  const [pulse, record, recordDays, slate, queues, legs, top, newest, feeds, activity] = await Promise.all([
    getPulse(today, 30),
    getTrackRecord(),
    getRecordByDay(12),
    getSlateSummary(day),
    getQueues(),
    countPendingCommunityLegs(),
    getTopMembers(today, 5),
    getNewestAccounts(5),
    getFeedHealth(),
    getActivity({ limit: 10 }),
  ]);

  const slateTotal = pickCategories.reduce((n, c) => n + slate.counts[c], 0) + slate.parlays;
  const slateName = day === today ? "Today's slate" : "Next slate";

  /* --------------------------------------------------------- the to-do list */
  const tasks: Task[] = [];
  if (!slate.published && slate.games > 0 && slate.firstKickoff && slate.firstKickoff > now) {
    tasks.push({
      key: "slate",
      icon: CalendarCheck,
      title: `${formatSlateWeekday(day)}'s slate isn't published`,
      detail: (
        <>
          {slateTotal === 0 ? "Nothing on it yet" : `${slateTotal} in draft`} · first kick-off{" "}
          <LocalTime at={slate.firstKickoff} format="kickoff" />
        </>
      ),
      href: `/admin/slate?date=${day}`,
      cta: slateTotal === 0 ? "Build it" : "Finish it",
      urgent: true,
    });
  }
  if (queues.dueToSettle > 0) {
    tasks.push({
      key: "settle",
      icon: CircleCheckBig,
      title: `${queues.dueToSettle} ${queues.dueToSettle === 1 ? "pick needs" : "picks need"} a result`,
      detail: queues.oldestDue ? (
        <>
          Oldest kicked off {since(queues.oldestDue, now)} — testers see it as awaiting a result
        </>
      ) : undefined,
      href: "/admin/settle",
      cta: "Settle",
      urgent: true,
    });
  }
  if (legs > 0) {
    tasks.push({
      key: "legs",
      icon: Layers,
      title: `${legs} community parlay ${legs === 1 ? "leg needs" : "legs need"} a result`,
      detail: "Props the box score couldn't grade — testers' parlays wait on them",
      href: "/admin/settle?tab=community",
      cta: "Settle",
      urgent: true,
    });
  }
  if (queues.openReports > 0) {
    tasks.push({
      key: "reports",
      icon: Flag,
      title: `${queues.openReports} open ${queues.openReports === 1 ? "report" : "reports"}`,
      detail: "Posts or accounts testers flagged",
      href: "/admin/reports",
      cta: "Review",
      urgent: true,
    });
  }
  if (queues.openFeedback > 0) {
    tasks.push({
      key: "feedback",
      icon: MessageSquareText,
      title: `${queues.openFeedback} unread feedback`,
      detail: "From the Send feedback button",
      href: "/admin/feedback",
      cta: "Read",
    });
  }
  if (queues.waiting > 0) {
    tasks.push({
      key: "waitlist",
      icon: Hourglass,
      title: `${queues.waiting} ${queues.waiting === 1 ? "person" : "people"} on the waitlist`,
      detail: "Not invited yet",
      href: "/admin/waitlist",
      cta: "Invite",
    });
  }
  if (!feedConfigured()) {
    tasks.push({ key: "feed", icon: RadioTower, title: "The odds feed is off", detail: "Set ODDS_API_KEY in the server's .env", href: "/admin/slate", cta: "Details", urgent: true });
  } else if (feeds.odds.error) {
    tasks.push({ key: "feed", icon: RadioTower, title: "The odds feed's last refresh failed", detail: feeds.odds.error, href: "/admin/slate", cta: "Details", urgent: true });
  } else if (feeds.odds.credits !== null && feeds.odds.credits < 100) {
    tasks.push({ key: "feed", icon: RadioTower, title: `Odds API credits running low: ${feeds.odds.credits} left`, href: "/admin/slate", cta: "Details" });
  }

  const trend = (key: "active" | "joined" | "posts" | "bets") => pulse.series.slice(-14).map((p) => p[key]);

  return (
    <div>
      <PageHeader
        title="Overview"
        description={
          <>
            <span className="num">{formatSlateDate(today)}</span> · weeks below are the last 7 slate days against the 7
            before
          </>
        }
        info="A slate day runs from 4:00 AM to 4:00 AM Eastern, the same as the board, so a late game counts on the day it was picked for. Active means any account that posted, liked, reposted, followed, took a pick, played a parlay, read a post or opened the site that day."
        actions={
          <Button size="sm" asChild>
            <Link href={`/admin/slate?date=${day}`}>
              <CalendarCheck aria-hidden="true" />
              Open slate builder
            </Link>
          </Button>
        }
      />

      {/* ------------------------------------------------- to-do + next slate */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel
          id="attention"
          title="Needs your attention"
          description={tasks.length ? `${tasks.length} ${tasks.length === 1 ? "thing" : "things"} waiting` : undefined}
          className="lg:col-span-2"
          bodyClassName="px-2 pb-2"
        >
          {tasks.length === 0 ? (
            <div className="flex items-center gap-3 px-3 pb-4 pt-1">
              <span className="grid size-9 place-items-center rounded-full bg-hit-dim text-hit">
                <CircleCheck className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-medium text-fg">All clear</p>
                <p className="text-xs text-fg-muted">Nothing to settle, publish, review or answer right now.</p>
              </div>
            </div>
          ) : (
            <ul>
              {tasks.map((t) => (
                <li key={t.key}>
                  <Link
                    href={t.href}
                    className="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-white/[0.03]"
                  >
                    <span
                      className={cn(
                        "grid size-9 shrink-0 place-items-center rounded-full",
                        t.urgent ? "bg-brand/10 text-brand" : "bg-surface-2 text-fg-muted",
                      )}
                    >
                      <t.icon className="size-[1.125rem]" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-fg">{t.title}</span>
                      {t.detail && <span className="block truncate text-xs text-fg-subtle">{t.detail}</span>}
                    </span>
                    <span className="shrink-0 rounded-full border border-border px-3 py-1 text-xs text-fg-muted transition-colors group-hover:border-brand/50 group-hover:text-fg">
                      {t.cta}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          id="slate"
          title={
            <span className="flex items-center gap-2">
              {slateName}
              <span className="num font-normal text-fg-muted">· {formatSlateDate(day)}</span>
            </span>
          }
          action={
            slate.published ? (
              <Badge variant="hit">Live</Badge>
            ) : (
              <Badge variant="pending">{slateTotal > 0 ? "Draft" : "Empty"}</Badge>
            )
          }
        >
          <dl className="grid grid-cols-3 gap-2">
            {[
              ...pickCategories.map((c) => ({ label: CATEGORY_LABELS[c], n: slate.counts[c], of: PICKS_PER_SLATE[c] })),
              { label: "Parlays", n: slate.parlays, of: PARLAYS_PER_SLATE },
            ].map((x) => (
              <div key={x.label} className="rounded-lg bg-surface-2 px-3 py-2.5">
                <dt className="truncate text-[0.6875rem] text-fg-subtle">{x.label}</dt>
                <dd className="num mt-0.5 text-lg font-semibold text-fg">
                  {x.n}
                  <span className="text-xs font-normal text-fg-subtle">/{x.of}</span>
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-fg-muted">
            {slate.games === 0 ? (
              "No games on file for this day."
            ) : (
              <>
                {slate.games} {slate.games === 1 ? "game" : "games"}
                {slate.firstKickoff && (
                  <>
                    {" "}· first kick-off <LocalTime at={slate.firstKickoff} format="kickoff" />
                  </>
                )}
              </>
            )}
            {slate.featured > 0 && <> · {slate.featured} featured</>}
          </p>
          <p className="mt-1 text-xs text-fg-subtle">
            {slate.published && slate.publishedAt ? (
              <>
                Published <LocalTime at={slate.publishedAt} format="datetime" /> — live to everyone.
              </>
            ) : slateTotal > 0 ? (
              "Testers can't see a draft until it's published."
            ) : (
              "Nothing added yet."
            )}
          </p>
          <Button className="mt-4 w-full" size="sm" variant={slate.published ? "outline" : "default"} asChild>
            <Link href={`/admin/slate?date=${day}`}>{slate.published ? "View the slate" : slateTotal === 0 ? "Build the slate" : "Continue"}</Link>
          </Button>
        </Panel>
      </div>

      {/* --------------------------------------------------------------- KPIs */}
      <KpiGrid className="mt-4">
        <Kpi
          label="Active accounts"
          value={pulse.active.now}
          delta={{ now: pulse.active.now, before: pulse.active.before, period: "prior 7 days" }}
          sub={`of ${pulse.accounts.total}`}
          trend={<MiniColumns values={trend("active")} highlightLast={7} label="Active accounts per day, last 14 days" />}
          href="/admin/users"
        />
        <Kpi
          label="New accounts"
          value={pulse.joined.now}
          delta={{ now: pulse.joined.now, before: pulse.joined.before, period: "prior 7 days" }}
          trend={<MiniColumns values={trend("joined")} highlightLast={7} label="New accounts per day, last 14 days" />}
          href="/admin/users"
        />
        <Kpi
          label="Posts and replies"
          value={pulse.posts.now}
          delta={{ now: pulse.posts.now, before: pulse.posts.before, period: "prior 7 days" }}
          trend={<MiniColumns values={trend("posts")} highlightLast={7} label="Posts per day, last 14 days" />}
        />
        <Kpi
          label="Bets taken"
          value={pulse.bets.now}
          delta={{ now: pulse.bets.now, before: pulse.bets.before, period: "prior 7 days" }}
          sub="picks + parlays played"
          trend={<MiniColumns values={trend("bets")} highlightLast={7} label="Bets taken per day, last 14 days" />}
          href="/admin/follows"
        />
      </KpiGrid>

      {/* ------------------------------------------------ activity + record */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel
          id="active-chart"
          title="Active accounts per day"
          description="Last 30 slate days · hover or focus a day for its count"
          className="lg:col-span-2"
        >
          <ColumnChart
            label="Active accounts per day, last 30 days"
            data={pulse.series.map((p) => ({
              key: p.day,
              label: shortDay(p.day),
              value: p.active,
              detail: [
                p.posts ? `${p.posts} post${p.posts === 1 ? "" : "s"}` : null,
                p.bets ? `${p.bets} bet${p.bets === 1 ? "" : "s"} taken` : null,
                p.joined ? `${p.joined} joined` : null,
              ]
                .filter(Boolean)
                .join(" · ") || undefined,
            }))}
          />
        </Panel>

        <Panel id="record" title="Oobee's record" description="Every published pick, all time" action={<PanelLink href="/admin/settle?tab=settled">Results</PanelLink>}>
          <p
            className={cn(
              "text-4xl font-semibold tracking-tight",
              record.settled === 0 ? "text-fg-subtle" : record.netUnits >= 0 ? "text-hit" : "text-miss",
            )}
          >
            {record.settled === 0 ? "—" : formatUnits(record.netUnits)}
          </p>
          <p className="num mt-1 text-sm text-fg-muted">
            {record.wins}–{record.losses}
            {record.pushes > 0 && `–${record.pushes}`}
            {record.roi !== null && <> · ROI {formatRate(record.roi)}</>}
            {record.winRate !== null && !record.sampleTooSmall && <> · {formatRate(record.winRate)} won</>}
          </p>
          {record.sampleTooSmall && (
            <p className="mt-0.5 text-xs text-fg-subtle">Win rate shows after {MIN_SAMPLE_FOR_RATE} decided picks.</p>
          )}
          {record.pending > 0 && <p className="mt-0.5 text-xs text-fg-subtle">{record.pending} still open</p>}
          {recordDays.length > 0 && (
            <div className="mt-5">
              <p className="mb-2 text-xs text-fg-subtle">Net units by slate day</p>
              <ColumnChart
                label="Net units by slate day"
                unit="units"
                diverging
                height={112}
                data={recordDays.map((d) => ({
                  key: d.day,
                  label: shortDay(d.day),
                  value: Math.round(d.net * 100) / 100,
                  detail: `${d.wins}–${d.losses}${d.pushes ? `–${d.pushes}` : ""}`,
                }))}
              />
            </div>
          )}
        </Panel>
      </div>

      {/* ------------------------------------------- log + people + feeds */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel
          id="recent"
          title="Recent activity"
          action={<PanelLink href="/admin/activity">View all</PanelLink>}
          className="lg:col-span-2"
        >
          {activity.items.length === 0 ? (
            <p className="text-sm text-fg-muted">Nothing logged yet.</p>
          ) : (
            <ActivityList items={activity.items} />
          )}
        </Panel>

        <div className="grid content-start gap-4">
          <Panel id="top" title="Most active this week" action={<PanelLink href="/admin/users">Users</PanelLink>}>
            {top.length === 0 ? (
              <p className="text-sm text-fg-muted">Nobody has done anything this week.</p>
            ) : (
              <ul className="space-y-1">
                {top.map((m) => (
                  <li key={m.id}>
                    <Link href={`/admin/users/${m.id}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/[0.03]">
                      <Avatar name={m.displayName || m.username} avatarId={m.avatarId} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-fg">{m.displayName || m.username}</span>
                        <span className="block truncate text-xs text-fg-subtle">
                          {[
                            m.posts ? `${m.posts} post${m.posts === 1 ? "" : "s"}` : null,
                            m.bets ? `${m.bets} bet${m.bets === 1 ? "" : "s"}` : null,
                            m.reactions ? `${m.reactions} like${m.reactions === 1 ? "" : "s"} & follows` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <span className="num text-sm font-medium text-fg-muted">{m.actions}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel id="newest" title="Newest accounts" action={<PanelLink href="/admin/users">All users</PanelLink>}>
            <ul className="space-y-1">
              {newest.map((u) => (
                <li key={u.id}>
                  <Link href={`/admin/users/${u.id}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/[0.03]">
                    <Avatar name={u.displayName || u.username} avatarId={u.avatarId} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-fg">{u.displayName || `@${u.username}`}</span>
                      <span className="block truncate text-xs text-fg-subtle">{u.email}</span>
                    </span>
                    <LocalTime at={u.createdAt} format="ago" className="num shrink-0 text-xs text-fg-subtle" />
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel id="feeds" title="Data feeds">
            <dl className="space-y-3 text-sm">
              <FeedRow
                name="Odds"
                on={feedConfigured()}
                last={feeds.odds.last}
                error={feeds.odds.error}
                extra={feeds.odds.credits !== null ? `${feeds.odds.credits.toLocaleString("en-US")} credits left` : null}
              />
              <FeedRow name="Scores" on={feedConfigured()} last={feeds.odds.scores} error={null} />
              <FeedRow name="Player stats" on={statsConfigured()} last={feeds.stats.last} error={feeds.stats.error} />
            </dl>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function FeedRow({
  name,
  on,
  last,
  error,
  extra,
}: {
  name: string;
  on: boolean;
  last: Date | null;
  error: string | null;
  extra?: string | null;
}) {
  const state = !on ? "Off" : error ? "Failing" : "OK";
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="min-w-0">
        <span className="text-fg">{name}</span>
        <span className="block truncate text-xs text-fg-subtle" title={error ?? undefined}>
          {error ? error : last ? (
            <>
              Refreshed {since(last)}
              {extra ? ` · ${extra}` : ""}
            </>
          ) : on ? (
            "Not run yet"
          ) : (
            "No API key set"
          )}
        </span>
      </dt>
      <dd>
        <Badge variant={state === "OK" ? "hit" : state === "Failing" ? "miss" : "default"}>{state}</Badge>
      </dd>
    </div>
  );
}
