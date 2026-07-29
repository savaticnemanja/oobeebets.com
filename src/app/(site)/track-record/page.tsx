import type { Metadata } from "next";
import { Info } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { StatTile, WindowTile, WinRateTile, RateBar } from "@/components/stat-tile";
import { Reveal, CountUp } from "@/components/ui/motion";
import { getSettledHistory, getTrackRecord } from "@/lib/stats";
import { pickProfit } from "@/lib/settlement";
import { STATUS_LABEL, STATUS_VARIANT, SPORT_EMOJI } from "@/components/pick-card";
import { cn, formatOdds, formatUnits, formatPct } from "@/lib/utils";
import { formatSlateDate } from "@/lib/slate-date";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Track record",
  description:
    "Every pick oobee bets has published, settled against the real final score. Wins and losses, nothing hidden, nothing deleted.",
  alternates: { canonical: "/track-record" },
};

export const revalidate = 60;

export default async function TrackRecordPage() {
  const [record, history] = await Promise.all([getTrackRecord(), getSettledHistory(200)]);
  const o = record.overall;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: `${SITE.name} track record`,
    description:
      "Complete settled betting pick history including wins and losses, graded against final scores.",
    url: `${SITE.url}/track-record`,
    creator: { "@type": "Organization", name: SITE.name },
    variableMeasured: [
      { "@type": "PropertyValue", name: "Settled picks", value: o.settled },
      { "@type": "PropertyValue", name: "Net units", value: o.netUnits.toFixed(2) },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <Reveal>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Track record
          </h1>
          <p className="mt-3 max-w-2xl text-pretty text-sm leading-relaxed text-fg-muted">
            Every logged pick is settled against the real final score — measured, never
            self-reported. One unit staked per bet: a win returns the price, a loss is
            &minus;1. Voids are excluded from every rate.
          </p>
        </Reveal>

        {/* --------------------------------------------------------- windows */}
        <Reveal delay={0.05}>
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <WindowTile stats={record.today} />
            <WindowTile stats={record.week} />
            <WindowTile stats={record.month} />
            <WindowTile stats={record.overall} />
          </div>
        </Reveal>

        {/* ----------------------------------------------------- summary row */}
        <Reveal delay={0.1}>
          <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatTile label="Settled" value={o.settled} />
            <StatTile label="Wins" value={o.wins} tone="hit" />
            <StatTile label="Losses" value={o.losses} tone="miss" />
            <StatTile
              label="Net units"
              tone={o.netUnits >= 0 ? "hit" : "miss"}
              value={
                <CountUp
                  value={o.netUnits}
                  decimals={2}
                  prefix={o.netUnits > 0 ? "+" : ""}
                  suffix="u"
                />
              }
              sub={o.roi !== null ? `${formatPct(o.roi, 1)} ROI` : undefined}
            />
            <WinRateTile stats={o} />
          </dl>
        </Reveal>

        {/* ------------------------------------------------- sample-size note */}
        {o.sampleTooSmall && (
          <Reveal delay={0.12}>
            <p className="mt-3 flex items-start gap-2 rounded-lg border border-pending/25 bg-pending-dim px-4 py-3 text-xs leading-relaxed text-pending">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                {o.wins + o.losses} settled — this is a sample, not a rate. Percentages
                are suppressed until 30 picks have graded. We would rather show you
                nothing than a number that looks like proof and isn&apos;t.
              </span>
            </p>
          </Reveal>
        )}

        {/* --------------------------------------------------- vs the market */}
        {record.vsMarket && !o.sampleTooSmall && (
          <Reveal delay={0.15}>
            <div className="mt-3 rounded-lg border border-hit/25 bg-hit-dim px-4 py-3 text-sm">
              <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-hit">
                vs the market
              </span>{" "}
              <span className="text-fg-muted">
                Won{" "}
                <span className="num font-semibold text-fg">
                  {formatPct(record.vsMarket.actualRate, 1)}
                </span>{" "}
                where the book priced{" "}
                <span className="num font-semibold text-fg">
                  {formatPct(record.vsMarket.impliedRate, 1)}
                </span>{" "}
                &mdash;{" "}
                <span
                  className={cn(
                    "num font-semibold",
                    record.vsMarket.edge >= 0 ? "text-hit" : "text-miss",
                  )}
                >
                  {record.vsMarket.edge >= 0 ? "+" : ""}
                  {formatPct(record.vsMarket.edge, 1)}
                </span>{" "}
                over {record.vsMarket.sample} calls.
              </span>
            </div>
          </Reveal>
        )}

        {/* ----------------------------------------------- confidence buckets */}
        <Reveal delay={0.2}>
          <section aria-labelledby="buckets-heading" className="mt-10">
            <h2 id="buckets-heading" className="text-sm font-semibold tracking-tight">
              How each confidence tier has done
            </h2>
            <div className="card-hairline mt-3 space-y-3 p-5">
              {record.buckets.map((b) => (
                <RateBar
                  key={b.label}
                  label={b.label}
                  rate={b.hitRate}
                  sample={b.sample}
                  tooSmall={b.sampleTooSmall}
                />
              ))}
            </div>
          </section>
        </Reveal>

        {/* -------------------------------------------------------- the table */}
        <Reveal delay={0.25}>
          <section aria-labelledby="picks-heading" className="mt-10">
            <h2 id="picks-heading" className="text-sm font-semibold tracking-tight">
              Every settled pick
            </h2>

            {history.length === 0 ? (
              <p className="card-hairline mt-3 p-8 text-center text-sm text-fg-muted">
                Nothing settled yet. The first graded pick shows up here.
              </p>
            ) : (
              <div className="card-hairline mt-3 overflow-hidden">
                <Table>
                  <caption className="sr-only">
                    Complete history of settled picks with market, price, stake and result
                  </caption>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">Date</TableHead>
                      <TableHead scope="col">Game</TableHead>
                      <TableHead scope="col">Market</TableHead>
                      <TableHead scope="col">Pick</TableHead>
                      <TableHead scope="col" className="text-right">Price</TableHead>
                      <TableHead scope="col" className="text-right">Units</TableHead>
                      <TableHead scope="col" className="text-right">Result</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((p) => {
                      const profit = pickProfit(p);
                      return (
                        <TableRow key={p.id}>
                          <TableCell className="num whitespace-nowrap text-xs text-fg-subtle">
                            {formatSlateDate(p.slateDate)}
                          </TableCell>
                          <TableCell className="max-w-56">
                            <span className="mr-1.5" aria-hidden="true">
                              {SPORT_EMOJI[p.sport]}
                            </span>
                            <span className="text-fg-muted">{p.event}</span>
                          </TableCell>
                          <TableCell className="text-xs capitalize text-fg-subtle">
                            {p.market}
                          </TableCell>
                          <TableCell className="font-medium text-fg">{p.selection}</TableCell>
                          <TableCell className="num text-right text-fg-muted">
                            {formatOdds(p.price)}
                          </TableCell>
                          <TableCell className="num text-right text-fg-subtle">
                            {Number(p.units).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="inline-flex items-center gap-2">
                              <span
                                className={cn(
                                  "num text-xs font-semibold",
                                  profit > 0
                                    ? "text-hit"
                                    : profit < 0
                                      ? "text-miss"
                                      : "text-fg-subtle",
                                )}
                              >
                                {p.status === "void" ? "—" : formatUnits(profit)}
                              </span>
                              <Badge variant={STATUS_VARIANT[p.status]}>
                                {STATUS_LABEL[p.status]}
                              </Badge>
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        </Reveal>
      </div>
    </>
  );
}
