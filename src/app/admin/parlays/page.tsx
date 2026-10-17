import type { Metadata } from "next";
import Link from "next/link";
import { Layers } from "lucide-react";
import { requireAdminPage } from "@/lib/auth";
import { getAllUserParlays, getOobeeParlays, getUserParlayTotals } from "@/lib/parlay-store";
import { recordFromCounts, type TrackRecord } from "@/lib/stats";
import { MIN_SAMPLE_FOR_RATE } from "@/lib/settlement";
import { PARLAY_STAKE_UNITS } from "@/lib/parlays";
import { nextGameDay } from "@/lib/odds/board";
import { slateDateString } from "@/lib/slate-date";
import { formatOdds, formatRate, formatSlateDate, formatUnits } from "@/lib/i18n/format";
import { t } from "@/lib/i18n";
import { Empty, Kpi, KpiGrid, NetUnits, PageHeader, Pager, Panel, PanelLink, pageParam } from "@/components/admin/kit";
import { ParlayTable } from "@/components/admin/parlay-table";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Parlays" };

export const dynamic = "force-dynamic";

const STATUS_LABEL = t().status;

/** A rate the sample cannot carry is a dash, same rule as everywhere else. */
function rateLabel(record: TrackRecord): string {
  return record.winRate === null || record.sampleTooSmall
    ? `under ${MIN_SAMPLE_FOR_RATE} settled`
    : `${formatRate(record.winRate)} won`;
}

const PAGE = 25;

export default async function AdminParlaysPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const [, params] = await Promise.all([requireAdminPage(), searchParams]);
  const page = pageParam(params.page);

  // Oobee's own: the slate being worked on — today when it has games, else the next game day.
  const day = (await nextGameDay(new Date())) ?? slateDateString();
  // The totals cover every tester parlay, graded in SQL; only the page's own
  // tickets are hydrated with their legs.
  const [totals, userParlays, oobee] = await Promise.all([
    getUserParlayTotals(),
    getAllUserParlays({ limit: PAGE, offset: (page - 1) * PAGE }),
    getOobeeParlays(day),
  ]);
  const record = recordFromCounts(totals.counts, Number(PARLAY_STAKE_UNITS));
  const { builders, shared, avgLegs, running: open } = totals;

  return (
    <div>
      <PageHeader
        title="Parlays"
        description="Every parlay a tester has built, how it went, and Oobee's own on the next slate."
        info={
          <>
            Testers&apos; parlays are flat at {Number(PARLAY_STAKE_UNITS).toFixed(2)}u each — no stake is collected — and
            graded from their legs, so they update themselves as results come in. Admin-built parlays are left out, the
            same way admin follows are: the people running the beta aren&apos;t evidence about it. Open a builder to see
            all of theirs.
          </>
        }
      />

      <KpiGrid>
        <Kpi label="Parlays built" value={totals.parlays} sub={`by ${builders} tester${builders === 1 ? "" : "s"} · ${shared} shared`} />
        <Kpi label="Average legs" value={avgLegs === null ? "—" : avgLegs.toFixed(1)} sub={`${open} still running`} />
        <Kpi label="Record" value={`${record.wins}–${record.losses}`} sub={rateLabel(record)} />
        <Kpi
          label="Net units"
          tone={record.settled === 0 ? "neutral" : record.netUnits >= 0 ? "hit" : "miss"}
          value={record.settled === 0 ? "—" : formatUnits(record.netUnits)}
          sub="flat stake, settled only"
        />
      </KpiGrid>

      <Panel
        id="oobee"
        className="mt-4"
        title={`Oobee's parlays · ${formatSlateDate(day)}`}
        description="On the board's Parlays tab"
        action={<PanelLink href={`/admin/slate?date=${day}&category=parlay`}>Build</PanelLink>}
      >
        {oobee.length === 0 ? (
          <p className="text-sm text-fg-muted">None on this slate yet.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {oobee.map((p) => (
              <li key={p.id} className="flex flex-wrap items-baseline gap-x-3 py-2 text-sm">
                <span className="num text-xs text-fg-subtle">#{p.rank}</span>
                <span className="text-fg">{p.title ?? `${p.legs.length}-leg`}</span>
                {p.featured && <Badge variant="brand">featured</Badge>}
                <span className="num text-fg-muted">{p.price === null ? "—" : formatOdds(p.price)}</span>
                <span className="text-xs text-fg-subtle">{STATUS_LABEL[p.status]}</span>
                <span className="ml-auto text-xs">
                  <NetUnits units={p.profit} settled={p.status === "pending" ? 0 : 1} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <section aria-labelledby="built-heading" className="mt-8">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="built-heading" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <Layers className="size-4 text-brand" aria-hidden="true" />
            Built by testers
          </h2>
          {open > 0 && <Badge variant="pending">{open} running</Badge>}
        </div>
        {totals.parlays === 0 ? (
          <Empty icon={Layers} title="Nobody has built one yet">
            The builder is on <Link href="/community/new" className="text-brand hover:underline">Community</Link>.
          </Empty>
        ) : (
          <>
            <ParlayTable parlays={userParlays} owner />
            <Pager
              page={page}
              pageSize={PAGE}
              total={totals.parlays}
              noun="parlays"
              href={(n) => (n > 1 ? `/admin/parlays?page=${n}` : "/admin/parlays")}
            />
          </>
        )}
      </section>
    </div>
  );
}
