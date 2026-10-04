import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Layers, Ticket } from "lucide-react";
import { getAuth } from "@/lib/auth";
import { getUserParlays } from "@/lib/parlay-store";
import { getMySingles, summariseMyBets, type MyBets } from "@/lib/stats";
import { MIN_SAMPLE_FOR_RATE, pickProfit } from "@/lib/settlement";
import { FOLLOW_STAKE_UNITS } from "@/lib/follows";
import { ParlayCard } from "@/components/parlay-card";
import { DeleteParlayButton } from "@/components/parlay-builder";
import { StatTile } from "@/components/stat-tile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CATEGORY_LABELS } from "@/lib/board";
import { formatOdds, formatRate, formatSlateDate, formatUnits } from "@/lib/i18n/format";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "My bets",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const STATUS_LABEL = t().status;

/** One line of the comparison table. A rate the sample can't carry is a dash. */
function RecordRow({ label, record }: { label: string; record: MyBets["singles"] }) {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-2.5 pr-3 text-fg">{label}</td>
      <td className="num py-2.5 px-3 text-right text-fg-muted">
        {record.wins}–{record.losses}
      </td>
      <td className="num py-2.5 px-3 text-right text-fg-muted">
        {record.winRate === null || record.sampleTooSmall
          ? "—"
          : formatRate(record.winRate)}
      </td>
      <td
        className={cn(
          "num py-2.5 pl-3 text-right font-medium",
          record.settled === 0
            ? "text-fg-subtle"
            : record.netUnits > 0
              ? "text-hit"
              : record.netUnits < 0
                ? "text-miss"
                : "text-fg-muted",
        )}
      >
        {record.settled === 0 ? "—" : formatUnits(record.netUnits)}
      </td>
    </tr>
  );
}

export default async function MyBetsPage() {
  const auth = await getAuth();
  if (!auth) redirect("/login?next=/my-bets");

  const [singles, parlays] = await Promise.all([
    getMySingles(auth.user.id),
    getUserParlays(auth.user.id),
  ]);

  const stats = summariseMyBets(singles, parlays);
  const stake = Number(FOLLOW_STAKE_UNITS);

  const openSingles = singles.filter((s) => s.status === "pending");
  const settledSingles = singles.filter((s) => s.status !== "pending");
  const openParlays = parlays.filter((p) => p.status === "pending");
  const settledParlays = parlays.filter((p) => p.status !== "pending");

  const nothingYet = singles.length === 0 && parlays.length === 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">My bets</h1>
      <p className="mt-1.5 max-w-2xl text-sm text-fg-muted">
        Everything you&apos;ve logged — the picks you ticked off and the parlays you
        built. Flat at {stake.toFixed(2)}u a bet, since we never ask you for a
        stake, so these are units rather than money.
      </p>

      {nothingYet ? (
        <div className="card-hairline mt-8 p-10 text-center">
          <Ticket className="mx-auto size-8 text-fg-subtle" aria-hidden="true" />
          <h2 className="mt-3 text-lg font-semibold tracking-tight">Nothing logged yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-fg-muted">
            Tap the circle on a pick to log that you took it, or build a parlay from
            today&apos;s board. Both show up here.
          </p>
          <Button className="mt-4" asChild>
            <Link href="/picks">Open today&apos;s board</Link>
          </Button>
        </div>
      ) : (
        <>
          {/* ---------------------------------------------------------- tiles */}
          <dl className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              label="Bets logged"
              value={singles.length + parlays.length}
              sub={`${singles.length} singles · ${parlays.length} parlays`}
            />
            <StatTile
              label="Record"
              value={`${stats.combined.wins}–${stats.combined.losses}`}
              sub={
                stats.combined.sampleTooSmall
                  ? `Under ${MIN_SAMPLE_FOR_RATE} settled`
                  : stats.combined.winRate !== null
                    ? formatRate(stats.combined.winRate)
                    : undefined
              }
            />
            <StatTile
              label="Net units"
              tone={stats.combined.netUnits >= 0 ? "hit" : "miss"}
              value={
                stats.combined.settled === 0
                  ? "—"
                  : formatUnits(stats.combined.netUnits)
              }
            />
            <StatTile
              label="Still running"
              tone="brand"
              value={openSingles.length + openParlays.length}
              sub="not yet graded"
            />
          </dl>

          {/* ------------------------------------------------- singles v parlays */}
          <div className="card-hairline mt-4 p-4">
            <h2 className="text-sm font-semibold tracking-tight">
              Singles against parlays
            </h2>
            <p className="mt-1 text-xs text-fg-subtle">
              Kept apart on purpose. A parlay wins rarely and pays a lot, so
              folding both into one number hides whether yours are paying for
              themselves.
            </p>
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="border-b border-border text-[0.6875rem] uppercase tracking-wider text-fg-subtle">
                  <th scope="col" className="pb-2 pr-3 text-left font-medium">
                    Bet type
                  </th>
                  <th scope="col" className="pb-2 px-3 text-right font-medium">
                    W–L
                  </th>
                  <th scope="col" className="pb-2 px-3 text-right font-medium">
                    Win rate
                  </th>
                  <th scope="col" className="pb-2 pl-3 text-right font-medium">
                    Net
                  </th>
                </tr>
              </thead>
              <tbody>
                <RecordRow label="Singles" record={stats.singles} />
                <RecordRow label="Parlays" record={stats.parlays} />
                <RecordRow label="Everything" record={stats.combined} />
              </tbody>
            </table>
            <p className="mt-3 text-xs text-fg-subtle">
              A win rate needs {MIN_SAMPLE_FOR_RATE} settled bets before it means
              anything — until then it shows a dash. W–L and units are facts at
              any sample size.
            </p>
          </div>

          {/* --------------------------------------------------------- parlays */}
          {parlays.length > 0 && (
            <section aria-labelledby="parlays-heading" className="mt-10">
              <div className="flex items-center justify-between gap-3">
                <h2
                  id="parlays-heading"
                  className="flex items-center gap-2 text-sm font-semibold tracking-tight"
                >
                  <Layers className="size-4 text-brand" aria-hidden="true" />
                  Your parlays
                </h2>
                {openParlays.length > 0 && (
                  <Badge variant="pending">{openParlays.length} running</Badge>
                )}
              </div>

              <div className="mt-4 grid gap-3">
                {[...openParlays, ...settledParlays].map((p) => (
                  <ParlayCard key={p.id} parlay={p}>
                    {p.open && <DeleteParlayButton parlayId={p.id} />}
                  </ParlayCard>
                ))}
              </div>
            </section>
          )}

          {/* --------------------------------------------------------- singles */}
          {singles.length > 0 && (
            <section aria-labelledby="singles-heading" className="mt-10">
              <h2 id="singles-heading" className="text-sm font-semibold tracking-tight">
                Picks you took
              </h2>

              <div className="card-hairline mt-4 overflow-hidden">
                <div className="w-full overflow-x-auto overscroll-x-contain">
                  <table className="w-full min-w-[34rem] text-sm">
                    <thead>
                      <tr className="border-b border-border text-[0.6875rem] uppercase tracking-wider text-fg-subtle">
                        <th scope="col" className="px-3 py-2 text-left font-medium">
                          Bet
                        </th>
                        <th scope="col" className="px-3 py-2 text-left font-medium">
                          Day
                        </th>
                        <th scope="col" className="px-3 py-2 text-right font-medium">
                          Price
                        </th>
                        <th scope="col" className="px-3 py-2 text-left font-medium">
                          Result
                        </th>
                        <th scope="col" className="px-3 py-2 text-right font-medium">
                          Units
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...openSingles, ...settledSingles].map((s) => {
                        const profit = pickProfit({
                          price: s.price,
                          units: FOLLOW_STAKE_UNITS,
                          status: s.status,
                        });
                        const graded = s.status !== "pending" && s.status !== "void";
                        return (
                          <tr key={s.pickId} className="border-b border-border last:border-0">
                            <td className="px-3 py-2.5">
                              <span className="text-fg">{s.selection}</span>
                              <span className="mt-0.5 block truncate text-xs text-fg-subtle">
                                {s.event} · {CATEGORY_LABELS[s.category]}
                              </span>
                            </td>
                            <td className="num whitespace-nowrap px-3 py-2.5 text-xs text-fg-subtle">
                              {formatSlateDate(s.slateDate)}
                            </td>
                            <td className="num px-3 py-2.5 text-right text-fg-muted">
                              {formatOdds(s.price)}
                            </td>
                            <td
                              className={cn(
                                "whitespace-nowrap px-3 py-2.5 text-xs",
                                s.status === "won"
                                  ? "text-hit"
                                  : s.status === "lost"
                                    ? "text-miss"
                                    : s.status === "pending"
                                      ? "text-pending"
                                      : "text-fg-subtle",
                              )}
                            >
                              {STATUS_LABEL[s.status]}
                            </td>
                            <td
                              className={cn(
                                "num px-3 py-2.5 text-right font-medium",
                                !graded
                                  ? "text-fg-subtle"
                                  : profit > 0
                                    ? "text-hit"
                                    : profit < 0
                                      ? "text-miss"
                                      : "text-fg-muted",
                              )}
                            >
                              {graded ? formatUnits(profit) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
