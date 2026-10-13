import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Fragment } from "react";
import { getAuth } from "@/lib/auth";
import { refreshResults } from "@/lib/odds/sync";
import { getPlayedParlays, getUserParlays, type ParlayView } from "@/lib/parlay-store";
import { getMySingles, getMyTakenPicks, summariseMyBets, type MyBets } from "@/lib/stats";
import { MIN_SAMPLE_FOR_RATE } from "@/lib/settlement";
import { FOLLOW_STAKE_UNITS, followWindowOpen } from "@/lib/follows";
import { formatRate, formatSlateDate, formatUnits } from "@/lib/i18n/format";
import { ParlayCard } from "@/components/parlay-card";
import { PickCard } from "@/components/pick-card";
import { DeleteParlayButton } from "@/components/parlay-builder";
import { ShareToggle } from "@/components/community-parlay-builder";
import { playable } from "@/components/social/parlay-row";
import { FeedTabs } from "@/components/social/feed";
import { SocialShell } from "@/components/social/social-shell";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Stats",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type Tab = "picks" | "parlays";
type Show = "all" | "game" | "prop" | "built" | "played";

/**
 * Your record: everything you've logged — the games and props you took, the
 * parlays you built, and the ones you played off Community or Oobee's board —
 * with the numbers on top. Laid out like the rest of the site: the 600px
 * column, flat rows, the same pick and ticket rows as Picks and Community
 * (so a pick can still be unticked, a ticket unplayed, until it starts).
 */
export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; show?: string }>;
}) {
  const [auth, params] = await Promise.all([getAuth(), searchParams]);
  if (!auth) redirect("/login?next=/stats");
  await refreshResults();

  const tab: Tab = params.tab === "parlays" ? "parlays" : "picks";
  const show = (["game", "prop", "built", "played"].includes(params.show ?? "") ? params.show : "all") as Show;

  const [singles, taken, built, played] = await Promise.all([
    getMySingles(auth.user.id),
    getMyTakenPicks(auth.user.id),
    getUserParlays(auth.user.id),
    getPlayedParlays(auth.user.id),
  ]);
  const parlays = [...built, ...played];
  const stats = summariseMyBets(singles, parlays);
  const stake = Number(FOLLOW_STAKE_UNITS);
  const running = singles.filter((s) => s.status === "pending").length + parlays.filter((p) => p.status === "pending").length;

  const picksShown = taken.filter((p) => show === "all" || p.category === show);
  const parlaysShown = [
    ...(show === "played" ? [] : built.map((p) => ({ p, mine: true }))),
    ...(show === "built" ? [] : played.map((p) => ({ p, mine: false }))),
  ].sort((a, b) => b.p.slateDate.localeCompare(a.p.slateDate) || b.p.createdAt.getTime() - a.p.createdAt.getTime());

  const href = (t: Tab, s: Show = "all") => `/stats?tab=${t}${s === "all" ? "" : `&show=${s}`}`;
  const pills: Array<{ key: Show; label: string; n: number }> =
    tab === "picks"
      ? [
          { key: "all", label: "All", n: taken.length },
          { key: "game", label: "Game bets", n: taken.filter((p) => p.category === "game").length },
          { key: "prop", label: "Player props", n: taken.filter((p) => p.category === "prop").length },
        ]
      : [
          { key: "all", label: "All", n: parlays.length },
          { key: "built", label: "Built", n: built.length },
          { key: "played", label: "Played", n: played.length },
        ];

  return (
    <SocialShell>
      {/* The page is named by the nav; the heading is for screen readers. */}
      <h1 className="sr-only">Stats</h1>

      {/* ---------------------------------------------------------- numbers */}
      <dl className="grid grid-cols-2 border-y border-border">
        <Cell label="Bets logged" value={singles.length + parlays.length} sub={`${singles.length} picks · ${parlays.length} parlays`} />
        <Cell
          label="Record"
          value={`${stats.combined.wins}–${stats.combined.losses}`}
          sub={
            stats.combined.sampleTooSmall
              ? `Win rate after ${MIN_SAMPLE_FOR_RATE} settled`
              : stats.combined.winRate !== null
                ? `${formatRate(stats.combined.winRate)} won`
                : undefined
          }
        />
        <Cell
          label="Net units"
          value={stats.combined.settled === 0 ? "—" : formatUnits(stats.combined.netUnits)}
          tone={stats.combined.settled === 0 ? undefined : stats.combined.netUnits >= 0 ? "hit" : "miss"}
        />
        <Cell label="Still running" value={running} sub="not graded yet" tone="brand" />
      </dl>

      {/* ------------------------------------------------ picks v parlays */}
      <section className="border-b border-border px-4 py-4" aria-labelledby="split-heading">
        <h2 id="split-heading" className="text-base font-bold tracking-tight">
          Picks against parlays
        </h2>
        <p className="mt-1 text-sm text-fg-muted">
          Kept apart: a parlay wins rarely and pays a lot, so one number would hide whether
          yours pay for themselves.
        </p>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="border-b border-border text-[0.6875rem] uppercase tracking-wider text-fg-subtle">
              <th scope="col" className="pb-2 pr-3 text-left font-medium">Bets</th>
              <th scope="col" className="px-3 pb-2 text-right font-medium">W–L</th>
              <th scope="col" className="px-3 pb-2 text-right font-medium">Win rate</th>
              <th scope="col" className="pb-2 pl-3 text-right font-medium">Net</th>
            </tr>
          </thead>
          <tbody>
            <RecordRow label="Picks" record={stats.singles} />
            <RecordRow label="Parlays" record={stats.parlays} />
            <RecordRow label="All" record={stats.combined} />
          </tbody>
        </table>
      </section>

      {/* -------------------------------------------------------- the lists */}
      <FeedTabs
        sticky
        active={tab}
        tabs={[
          { key: "picks", label: "Picks", href: href("picks") },
          { key: "parlays", label: "Parlays", href: href("parlays") },
        ]}
        actions={
          <InfoTip label="About your stats">
            <p>
              Everything you&apos;ve logged: picks you ticked, parlays you built, and parlays you
              played off Community or Oobee&apos;s board.
            </p>
            <p>
              Every bet counts at a flat {stake.toFixed(2)}u, since we never ask for a stake — so
              these are units, not money.
            </p>
          </InfoTip>
        }
      />
      <nav aria-label="Show" className="flex gap-2 overflow-x-auto border-b border-border px-4 py-3 [scrollbar-width:none]">
        {pills.map((p) => (
          <Link
            key={p.key}
            href={href(tab, p.key)}
            aria-current={show === p.key ? "page" : undefined}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
              show === p.key ? "border-fg bg-fg text-black" : "border-border text-fg-muted hover:border-border-strong hover:text-fg",
            )}
          >
            {p.label}
            <span className={cn("num text-xs", show === p.key ? "text-black/60" : "text-fg-subtle")}>{p.n}</span>
          </Link>
        ))}
      </nav>

      {tab === "picks" ? (
        picksShown.length === 0 ? (
          <Empty>
            Nothing here yet. Tap the circle on a pick on{" "}
            <Link href="/picks" className="text-brand hover:underline">Picks</Link> to log that you took it.
          </Empty>
        ) : (
          byDay(picksShown, (p) => p.slateDate).map(([day, list]) => (
            <Fragment key={day}>
              <DayLabel day={day} />
              {list.map((p) => (
                <PickCard key={p.id} pick={p} follow={{ taken: true, open: followWindowOpen(p) }} variant="row" />
              ))}
            </Fragment>
          ))
        )
      ) : parlaysShown.length === 0 ? (
        <Empty>
          Nothing here yet. Build one, or play someone&apos;s from{" "}
          <Link href="/community" className="text-brand hover:underline">Community</Link>.
        </Empty>
      ) : (
        byDay(parlaysShown, (x) => x.p.slateDate).map(([day, list]) => (
          <Fragment key={day}>
            <DayLabel day={day} />
            {list.map(({ p, mine }) => (
              <ParlayCard
                key={p.id}
                parlay={p}
                variant="row"
                kicker={<Origin parlay={p} mine={mine} />}
                follow={mine ? undefined : playable(p, p.ownerId, auth.user.id)}
              >
                {mine && (
                  <div className="flex items-center gap-3">
                    <ShareToggle parlayId={p.id} shared={p.shared} />
                    {p.open && <DeleteParlayButton parlayId={p.id} />}
                  </div>
                )}
              </ParlayCard>
            ))}
          </Fragment>
        ))
      )}
    </SocialShell>
  );
}

/** Groups an already-sorted list by day, keeping the order. */
function byDay<T>(list: T[], dayOf: (t: T) => string): Array<[string, T[]]> {
  const out: Array<[string, T[]]> = [];
  for (const item of list) {
    const d = dayOf(item);
    if (out.at(-1)?.[0] === d) out.at(-1)![1].push(item);
    else out.push([d, [item]]);
  }
  return out;
}

function DayLabel({ day }: { day: string }) {
  return (
    <h3 className="num border-b border-border bg-surface/40 px-4 py-2 text-sm font-semibold text-fg-muted">
      {formatSlateDate(day)}
    </h3>
  );
}

/** Whose ticket it is — yours, someone's off Community, or Oobee's. */
function Origin({ parlay, mine }: { parlay: ParlayView; mine: boolean }) {
  const text = mine
    ? "You built this"
    : parlay.ownerId === null
      ? "Played · Oobee's parlay"
      : `Played · from @${parlay.ownerUsername}`;
  return <p className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-[0.15em] text-fg-subtle">{text}</p>;
}

function Cell({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "hit" | "miss" | "brand";
}) {
  return (
    <div className="border-border px-4 py-3 odd:border-r [&:nth-child(-n+2)]:border-b">
      <dt className="text-[0.6875rem] font-medium uppercase tracking-wider text-fg-subtle">{label}</dt>
      <dd
        className={cn(
          "num mt-1 text-2xl font-bold tracking-tight",
          tone === "hit" ? "text-hit" : tone === "miss" ? "text-miss" : tone === "brand" ? "text-brand" : "text-fg",
        )}
      >
        {value}
        {sub && <span className="mt-0.5 block text-xs font-normal tracking-normal text-fg-subtle">{sub}</span>}
      </dd>
    </div>
  );
}

function RecordRow({ label, record }: { label: string; record: MyBets["singles"] }) {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-2.5 pr-3 text-fg">{label}</td>
      <td className="num px-3 py-2.5 text-right text-fg-muted">
        {record.wins}–{record.losses}
      </td>
      <td className="num px-3 py-2.5 text-right text-fg-muted">
        {record.winRate === null || record.sampleTooSmall ? "—" : formatRate(record.winRate)}
      </td>
      <td
        className={cn(
          "num py-2.5 pl-3 text-right font-medium",
          record.settled === 0 ? "text-fg-subtle" : record.netUnits > 0 ? "text-hit" : record.netUnits < 0 ? "text-miss" : "text-fg-muted",
        )}
      >
        {record.settled === 0 ? "—" : formatUnits(record.netUnits)}
      </td>
    </tr>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-10 text-center text-sm text-fg-muted">{children}</p>;
}
