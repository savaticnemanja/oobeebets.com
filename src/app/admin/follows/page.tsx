import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { slates } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import { getFollowAnalytics, getSlateTakeRates } from "@/lib/stats";
import { MIN_SAMPLE_FOR_RATE } from "@/lib/settlement";
import { FOLLOW_STAKE_UNITS } from "@/lib/follows";
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
import { FollowBreakdownTable } from "@/components/admin/follow-breakdown-table";
import { SlateDatePicker } from "@/components/slate-date-picker";
import { CATEGORY_LABELS } from "@/lib/board";
import { isValidSlateDate, slateDateString } from "@/lib/slate-date";
import {
  formatDateTime,
  formatOdds,
  formatRate,
  formatSlateDate,
  formatUnits,
} from "@/lib/i18n/format";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { TrackRecord } from "@/lib/stats";

export const metadata: Metadata = { title: "Follows" };

export const dynamic = "force-dynamic";

const STATUS_LABEL = t().status;

/** A rate the sample cannot support is a dash and a reason, never a number. */
function Rate({ record }: { record: TrackRecord }) {
  if (record.winRate === null) return <span className="text-fg-subtle">—</span>;
  if (record.sampleTooSmall) {
    return (
      <span className="text-fg-subtle" title={`Under ${MIN_SAMPLE_FOR_RATE} settled bets`}>
        —
      </span>
    );
  }
  return <span className="text-fg">{formatRate(record.winRate)}</span>;
}

function Units({ units, settled }: { units: number; settled: number }) {
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

export default async function AdminFollowsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const [auth, params] = await Promise.all([getAuth(), searchParams]);
  // 404 rather than 403, same as the layout: a non-admin does not learn this
  // route exists. The layout already guards it; this is the belt to its braces
  // and matches /admin/users.
  if (!auth?.isAdmin) notFound();

  const today = slateDateString();
  const date = params.date && isValidSlateDate(params.date) ? params.date : today;

  const [analytics, takeRates, availableDates] = await Promise.all([
    getFollowAnalytics(),
    getSlateTakeRates(date),
    db
      .select({ date: slates.date })
      .from(slates)
      .where(sql`${slates.publishedAt} is not null`)
      .orderBy(sql`${slates.date} desc`)
      .limit(30),
  ]);

  const { oobee, beta } = analytics;

  // The take-up denominator. Every tester is a possible taker of a pick on a
  // slate they were around for, and the cohort is small enough that quoting
  // the whole of it is more honest than quoting only the engaged part — which
  // would make a pick two of three active testers took read as 67% take-up
  // across a beta of thirty.
  const denominator = analytics.testers;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Follows</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-fg-muted">
            Who took what. A tester taps one circle on a pick card and nothing
            else is asked for — no stake, no book — so every unit figure below is
            flat at {Number(FOLLOW_STAKE_UNITS).toFixed(2)}u a bet, which is the
            one thing we can honestly claim to know about their stake.
          </p>
        </div>
        {analytics.follows > 0 && (
          <Badge variant="brand">{analytics.follows} followed</Badge>
        )}
      </div>

      {/* ------------------------------------------------------------ tiles */}
      <dl className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Testers"
          value={analytics.testers}
          sub={`${analytics.followers} have followed something`}
        />
        <StatTile label="Bets followed" value={analytics.follows} />
        <StatTile
          label="Take-up"
          tone="brand"
          value={analytics.takeRate === null ? "—" : formatRate(analytics.takeRate)}
          sub="of the chances testers had"
        />
        <StatTile
          label="Per follower"
          value={
            analytics.avgPerFollower === null
              ? "—"
              : analytics.avgPerFollower.toFixed(1)
          }
          sub="bets followed, average"
        />
      </dl>

      {/* ----------------------------------------------- the two datasets */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Oobee vs. the room</CardTitle>
          <CardDescription>
            Two records over the same board. Oobee&apos;s is every published pick at
            the stake it was called at; the testers&apos; is only the picks they
            actually took, flat-staked. A gap between them is the interesting
            result either way round — it says the picks people take are not the
            picks we publish.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="card-hairline overflow-hidden">
            <Table className="min-w-[36rem]">
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Dataset</TableHead>
                  <TableHead scope="col" className="text-right">
                    Bets
                  </TableHead>
                  <TableHead scope="col" className="text-right">
                    W–L
                  </TableHead>
                  <TableHead scope="col" className="text-right">
                    Win rate
                  </TableHead>
                  <TableHead scope="col" className="text-right">
                    Net units
                  </TableHead>
                  <TableHead scope="col" className="text-right">
                    ROI
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  { label: "Oobee — every published pick", r: oobee },
                  { label: "Testers — the picks they took", r: beta },
                ].map(({ label, r }) => (
                  <TableRow key={label}>
                    <TableCell className="text-fg">{label}</TableCell>
                    <TableCell className="num text-right text-fg-muted">
                      {r.settled + r.pending}
                    </TableCell>
                    <TableCell className="num text-right text-fg-muted">
                      {r.wins}–{r.losses}
                    </TableCell>
                    <TableCell className="num text-right">
                      <Rate record={r} />
                    </TableCell>
                    <TableCell className="num text-right">
                      <Units units={r.netUnits} settled={r.settled} />
                    </TableCell>
                    <TableCell className="num text-right text-fg-muted">
                      {r.roi === null ? "—" : formatRate(r.roi)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="mt-3 text-xs text-fg-subtle">
            A win rate shows only past {MIN_SAMPLE_FOR_RATE} settled bets. Below
            that it is a dash — W–L and net units are facts at any sample size, a
            percentage is not.
          </p>
        </CardContent>
      </Card>

      {/* --------------------------------------------------- what they follow */}
      <section aria-labelledby="types-heading" className="mt-10">
        <h2 id="types-heading" className="text-sm font-semibold tracking-tight">
          What they follow
        </h2>
        <p className="mt-1 max-w-2xl text-xs text-fg-subtle">
          &ldquo;vs. share&rdquo; is this slice&apos;s share of all follows over its share
          of all published picks. 1.00× is followed exactly in proportion to how
          often it appeared; above that is over its weight.
        </p>

        <div className="mt-4 space-y-6">
          <FollowBreakdownTable rows={analytics.byCategory} dimension="Board" />
          <FollowBreakdownTable rows={analytics.byMarket} dimension="Bet type" />
          <FollowBreakdownTable rows={analytics.byLeague} dimension="League" />
        </div>
      </section>

      {/* ------------------------------------------------- consistency split */}
      <Card className="mt-10">
        <CardHeader>
          <CardTitle>Do the regulars do better?</CardTitle>
          <CardDescription>
            Testers who have followed at least one pick, split at the cohort&apos;s
            median — how often they take a pick that was available to them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {analytics.byConsistency.length === 0 ? (
            <p className="text-sm text-fg-muted">
              Not enough testers following yet to split the room in half — this
              appears once four of them have taken something.
            </p>
          ) : (
            <div className="card-hairline overflow-hidden">
              <Table className="min-w-[34rem]">
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Group</TableHead>
                    <TableHead scope="col" className="text-right">
                      Testers
                    </TableHead>
                    <TableHead scope="col" className="text-right">
                      Follows
                    </TableHead>
                    <TableHead scope="col" className="text-right">
                      Avg. take-up
                    </TableHead>
                    <TableHead scope="col" className="text-right">
                      W–L
                    </TableHead>
                    <TableHead scope="col" className="text-right">
                      Net units
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analytics.byConsistency.map((g) => (
                    <TableRow key={g.label}>
                      <TableCell className="text-fg">{g.label}</TableCell>
                      <TableCell className="num text-right text-fg-muted">
                        {g.testers}
                      </TableCell>
                      <TableCell className="num text-right text-fg-muted">
                        {g.follows}
                      </TableCell>
                      <TableCell className="num text-right text-fg-muted">
                        {g.consistency === null ? "—" : formatRate(g.consistency)}
                      </TableCell>
                      <TableCell className="num text-right text-fg-muted">
                        {g.record.wins}–{g.record.losses}
                      </TableCell>
                      <TableCell className="num text-right">
                        <Units units={g.record.netUnits} settled={g.record.settled} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------------ per-pick take */}
      <section aria-labelledby="takeup-heading" className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="takeup-heading" className="text-sm font-semibold tracking-tight">
              Take-up, pick by pick
            </h2>
            <p className="mt-1 text-xs text-fg-subtle">
              <span className="num">{formatSlateDate(date)}</span> · out of{" "}
              {denominator} tester{denominator === 1 ? "" : "s"}
            </p>
          </div>
          {availableDates.length > 0 && (
            <SlateDatePicker
              dates={availableDates.map((d) => d.date)}
              current={date}
              basePath="/admin/follows"
            />
          )}
        </div>

        {takeRates.length === 0 ? (
          <p className="mt-4 text-sm text-fg-muted">Nothing on the board that day.</p>
        ) : (
          <div className="card-hairline mt-4 overflow-hidden">
            <Table className="min-w-[44rem]">
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Pick</TableHead>
                  <TableHead scope="col">Board</TableHead>
                  <TableHead scope="col" className="text-right">
                    Price
                  </TableHead>
                  <TableHead scope="col">Result</TableHead>
                  <TableHead scope="col" className="text-right">
                    Took it
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {takeRates.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="flex items-baseline gap-2">
                        <span className="num text-xs text-fg-subtle">#{p.rank}</span>
                        <span className="text-fg">{p.selection}</span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-fg-subtle">{p.event}</p>
                    </TableCell>
                    <TableCell className="text-xs text-fg-muted">
                      {CATEGORY_LABELS[p.category]}
                    </TableCell>
                    <TableCell className="num text-right text-fg-muted">
                      {formatOdds(p.price)}
                    </TableCell>
                    <TableCell className="text-xs text-fg-muted">
                      {STATUS_LABEL[p.status]}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="num text-fg">{p.takers}</span>
                      {denominator > 0 && (
                        <span className="num ml-2 text-xs text-fg-subtle">
                          {formatRate(p.takers / denominator, 0)}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* -------------------------------------------------------- per tester */}
      <section aria-labelledby="testers-heading" className="mt-10">
        <h2 id="testers-heading" className="text-sm font-semibold tracking-tight">
          Tester by tester
        </h2>
        <p className="mt-1 max-w-2xl text-xs text-fg-subtle">
          &ldquo;Of chances&rdquo; counts only the picks that were still ahead of
          kick-off when the account was created — somebody who joined on Tuesday
          is not marked down for Monday&apos;s board.
        </p>

        {analytics.testerRows.length === 0 ? (
          <p className="mt-4 text-sm text-fg-muted">No tester accounts yet.</p>
        ) : (
          <div className="card-hairline mt-4 overflow-hidden">
            <Table className="min-w-[46rem]">
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Tester</TableHead>
                  <TableHead scope="col" className="text-right">
                    Followed
                  </TableHead>
                  <TableHead scope="col" className="text-right">
                    Of chances
                  </TableHead>
                  <TableHead scope="col" className="text-right">
                    W–L
                  </TableHead>
                  <TableHead scope="col" className="text-right">
                    Net units
                  </TableHead>
                  <TableHead scope="col" className="text-right">
                    Last
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analytics.testerRows.map((u) => (
                  <TableRow key={u.userId}>
                    <TableCell className="text-fg">{u.email}</TableCell>
                    <TableCell className="num text-right text-fg">{u.follows}</TableCell>
                    <TableCell className="num text-right text-fg-muted">
                      {u.consistency === null ? "—" : formatRate(u.consistency)}
                      <span className="ml-1.5 text-xs text-fg-subtle">
                        of {u.opportunities}
                      </span>
                    </TableCell>
                    <TableCell className="num text-right text-fg-muted">
                      {u.follows === 0 ? "—" : `${u.record.wins}–${u.record.losses}`}
                    </TableCell>
                    <TableCell className="num text-right">
                      <Units units={u.record.netUnits} settled={u.record.settled} />
                    </TableCell>
                    <TableCell className="num text-right text-xs text-fg-subtle">
                      {u.lastFollowAt ? formatDateTime(u.lastFollowAt) : "—"}
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
