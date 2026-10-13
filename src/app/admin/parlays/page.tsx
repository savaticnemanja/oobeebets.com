import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Layers } from "lucide-react";
import { getAuth } from "@/lib/auth";
import { getAllUserParlays, getOobeeParlays } from "@/lib/parlay-store";
import { summariseRecord, type TrackRecord } from "@/lib/stats";
import { MIN_SAMPLE_FOR_RATE } from "@/lib/settlement";
import { PARLAY_STAKE_UNITS } from "@/lib/parlays";
import { StatTile } from "@/components/stat-tile";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ParlayLegList } from "@/components/parlay-card";
import { slateDateString } from "@/lib/slate-date";
import {
  formatOdds,
  formatRate,
  formatSlateDate,
  formatUnits,
} from "@/lib/i18n/format";
import { LocalTime } from "@/components/local-time";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Parlays" };

export const dynamic = "force-dynamic";

const STATUS_LABEL = t().status;

function Net({ units, settled }: { units: number; settled: number }) {
  if (settled === 0) return <span className="text-fg-subtle">—</span>;
  return (
    <span
      className={cn(
        "font-medium",
        units > 0 ? "text-hit" : units < 0 ? "text-miss" : "text-fg-muted",
      )}
    >
      {formatUnits(units)}
    </span>
  );
}

/** A rate the sample cannot carry is a dash, same rule as everywhere else. */
function rateLabel(record: TrackRecord): string {
  return record.winRate === null || record.sampleTooSmall
    ? `Under ${MIN_SAMPLE_FOR_RATE} settled`
    : formatRate(record.winRate);
}

export default async function AdminParlaysPage() {
  const auth = await getAuth();
  if (!auth?.isAdmin) notFound();

  const today = slateDateString();
  const [userParlays, oobeeToday] = await Promise.all([
    getAllUserParlays(),
    getOobeeParlays(today),
  ]);

  // Graded once in the store, summarised here at the tester's flat stake.
  const record = summariseRecord(
    userParlays.map((p) => ({
      price: p.price ?? 100,
      units: PARLAY_STAKE_UNITS,
      status: p.status,
    })),
  );

  const builders = new Set(userParlays.map((p) => p.ownerEmail)).size;
  const open = userParlays.filter((p) => p.status === "pending").length;
  const avgLegs =
    userParlays.length > 0
      ? userParlays.reduce((n, p) => n + p.legs.length, 0) / userParlays.length
      : null;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Parlays</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-fg-muted">
            Every parlay a tester has built out of the board. Flat at{" "}
            {Number(PARLAY_STAKE_UNITS).toFixed(2)}u each — no stake is collected —
            and graded from the legs, so these update themselves as you settle
            picks on the settle tab.
          </p>
        </div>
        {userParlays.length > 0 && (
          <Badge variant="brand">{userParlays.length} built</Badge>
        )}
      </div>

      <dl className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Parlays built"
          value={userParlays.length}
          sub={`by ${builders} tester${builders === 1 ? "" : "s"}`}
        />
        <StatTile
          label="Average legs"
          value={avgLegs === null ? "—" : avgLegs.toFixed(1)}
        />
        <StatTile
          label="Record"
          value={`${record.wins}–${record.losses}`}
          sub={rateLabel(record)}
        />
        <StatTile
          label="Net units"
          tone={record.netUnits >= 0 ? "hit" : "miss"}
          value={record.settled === 0 ? "—" : formatUnits(record.netUnits)}
        />
      </dl>

      {/* -------------------------------------------------- Oobee's own today */}
      <Card className="mt-8">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Oobee&apos;s parlays today</CardTitle>
            <Badge variant={oobeeToday.length > 0 ? "hit" : "pending"}>
              {oobeeToday.length} up
            </Badge>
          </div>
          <CardDescription>
            Published on the board&apos;s third tab. Build them on the{" "}
            <Link href="/admin/slate?category=parlay" className="text-brand hover:underline">
              publish slate
            </Link>{" "}
            page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {oobeeToday.length === 0 ? (
            <p className="text-sm text-fg-muted">
              None today. The parlay tab on the board will say so too.
            </p>
          ) : (
            <ul className="space-y-2">
              {oobeeToday.map((p) => (
                <li key={p.id} className="flex flex-wrap items-baseline gap-x-3 text-sm">
                  <span className="num text-xs text-fg-subtle">#{p.rank}</span>
                  <span className="text-fg">{p.title ?? `${p.legs.length}-leg`}</span>
                  <span className="num text-fg-muted">
                    {p.price === null ? "—" : formatOdds(p.price)}
                  </span>
                  <span className="text-xs text-fg-subtle">
                    {STATUS_LABEL[p.status]}
                  </span>
                  <span className="num ml-auto text-xs">
                    <Net units={p.profit} settled={p.status === "pending" ? 0 : 1} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------------- tester-built */}
      <section aria-labelledby="built-heading" className="mt-10">
        <div className="flex items-center justify-between gap-3">
          <h2
            id="built-heading"
            className="flex items-center gap-2 text-sm font-semibold tracking-tight"
          >
            <Layers className="size-4 text-brand" aria-hidden="true" />
            Built by testers
          </h2>
          {open > 0 && <Badge variant="pending">{open} running</Badge>}
        </div>
        <p className="mt-1 max-w-2xl text-xs text-fg-subtle">
          Newest first. Admin-built parlays are excluded, the same way admin
          follows are — the people running the beta are not evidence about it.
        </p>

        {userParlays.length === 0 ? (
          <p className="mt-4 text-sm text-fg-muted">
            Nobody has built one yet. The builder is on the board&apos;s parlay tab.
          </p>
        ) : (
          <div className="card-hairline mt-4 overflow-hidden">
            <Table className="min-w-[52rem]">
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Tester</TableHead>
                  <TableHead scope="col">Legs</TableHead>
                  <TableHead scope="col" className="text-right">
                    Price
                  </TableHead>
                  <TableHead scope="col">Result</TableHead>
                  <TableHead scope="col" className="text-right">
                    Units
                  </TableHead>
                  <TableHead scope="col" className="text-right">
                    Built
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {userParlays.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="align-top">
                      {p.ownerId ? (
                        <Link
                          href={`/admin/follows/${p.ownerId}`}
                          className="text-fg underline-offset-4 transition-colors hover:text-brand hover:underline"
                        >
                          {p.ownerEmail}
                        </Link>
                      ) : (
                        <span className="text-fg">{p.ownerEmail}</span>
                      )}
                      <span className="num mt-0.5 block text-xs text-fg-subtle">
                        {formatSlateDate(p.slateDate)}
                      </span>
                    </TableCell>
                    <TableCell className="align-top">
                      <span className="num text-xs text-fg-subtle">
                        {p.legs.length} legs
                      </span>
                      <div className="mt-1">
                        <ParlayLegList legs={p.legs} />
                      </div>
                    </TableCell>
                    <TableCell className="num align-top text-right text-fg-muted">
                      {p.price === null ? "—" : formatOdds(p.price)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "align-top text-xs",
                        p.status === "won"
                          ? "text-hit"
                          : p.status === "lost"
                            ? "text-miss"
                            : p.status === "pending"
                              ? "text-pending"
                              : "text-fg-subtle",
                      )}
                    >
                      {STATUS_LABEL[p.status]}
                    </TableCell>
                    <TableCell className="num align-top text-right">
                      <Net
                        units={p.profit}
                        settled={p.status === "pending" || p.status === "void" ? 0 : 1}
                      />
                    </TableCell>
                    <TableCell className="num align-top text-right text-xs text-fg-subtle">
                      <LocalTime at={p.createdAt} format="datetime" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
