import { Badge } from "@/components/ui/badge";
import { Kpi } from "@/components/admin/kit";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CATEGORY_LABELS } from "@/lib/board";
import { MIN_SAMPLE_FOR_RATE, pickProfit } from "@/lib/settlement";
import { FOLLOW_STAKE_UNITS } from "@/lib/follows";
import type { FollowedPick, PlayerFollows } from "@/lib/stats";
import {
  formatOdds,
  formatRate,
  formatSlateDate,
  formatUnits,
} from "@/lib/i18n/format";
import { LocalTime } from "@/components/local-time";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/*
 * One account's bets: what is riding now and every settled bet they took, day
 * by day — the Bets tab of their page in Users.
 */

const STATUS_LABEL = t().status;

const STATUS_TONE: Record<string, string> = {
  won: "text-hit",
  lost: "text-miss",
  push: "text-fg-muted",
  void: "text-void line-through",
  pending: "text-pending",
};

/**
 * One row of a player's card. The result column is this tester's result — flat
 * at FOLLOW_STAKE_UNITS — not the pick's, which is why it can differ from the
 * same pick's figure on the board.
 */
function PickRow({ p }: { p: FollowedPick }) {
  const profit = pickProfit({ price: p.price, units: FOLLOW_STAKE_UNITS, status: p.status });
  const settled = p.status !== "pending" && p.status !== "void";

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-baseline gap-2">
          <span className="num text-xs text-fg-subtle">#{p.rank}</span>
          <span className="text-fg">{p.selection}</span>
        </div>
        <p className="mt-0.5 truncate text-xs text-fg-subtle">
          {p.event}
          {p.finalScore ? ` · Final ${p.finalScore}` : ""}
        </p>
      </TableCell>
      <TableCell className="whitespace-nowrap text-xs text-fg-muted">
        {CATEGORY_LABELS[p.category]}
        <span className="ml-1.5 text-fg-subtle">{p.league}</span>
      </TableCell>
      <TableCell className="num text-right text-fg-muted">{formatOdds(p.price)}</TableCell>
      <TableCell className={cn("whitespace-nowrap text-xs", STATUS_TONE[p.status])}>
        {STATUS_LABEL[p.status]}
      </TableCell>
      <TableCell className="num text-right">
        {settled ? (
          <span
            className={cn(
              "font-medium",
              profit > 0 ? "text-hit" : profit < 0 ? "text-miss" : "text-fg-muted",
            )}
          >
            {formatUnits(profit)}
          </span>
        ) : (
          <span className="text-fg-subtle">—</span>
        )}
      </TableCell>
      <TableCell className="num whitespace-nowrap text-right text-xs text-fg-subtle">
        <LocalTime at={p.takenAt} format="datetime" />
      </TableCell>
    </TableRow>
  );
}

function CardTable({ picks }: { picks: FollowedPick[] }) {
  return (
    <div className="card-hairline overflow-hidden">
      <Table className="min-w-[46rem]">
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Bet</TableHead>
            <TableHead scope="col">Board</TableHead>
            <TableHead scope="col" className="text-right">
              Price
            </TableHead>
            <TableHead scope="col">Result</TableHead>
            <TableHead scope="col" className="text-right">
              Units
            </TableHead>
            <TableHead scope="col" className="text-right">
              Taken
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {picks.map((p) => (
            <PickRow key={p.pickId} p={p} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function PlayerBets({ player }: { player: PlayerFollows }) {
  const { user, record } = player;
  const followed = player.open.length + player.days.reduce((n, d) => n + d.picks.length, 0);

  return (
    <div>
      {user.role === "admin" && (
        <p className="mb-4 rounded-lg border border-pending/30 bg-pending-dim px-4 py-2.5 text-xs text-pending">
          This is an admin account. Its bets are left out of every cohort figure on Follows, so the numbers below
          won&apos;t add up to anything there.
        </p>
      )}

      {/* ------------------------------------------------------------ tiles */}
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Bets followed"
          value={followed}
          sub={`of ${player.opportunities} they could have`}
        />
        <Kpi
          label="Follows"
          tone="brand"
          value={player.consistency === null ? "—" : formatRate(player.consistency)}
          sub="of the chances they had"
        />
        <Kpi
          label="Record"
          value={`${record.wins}–${record.losses}`}
          sub={
            record.sampleTooSmall
              ? `Under ${MIN_SAMPLE_FOR_RATE} settled`
              : record.winRate !== null
                ? formatRate(record.winRate)
                : undefined
          }
        />
        <Kpi
          label="Net units"
          tone={record.netUnits >= 0 ? "hit" : "miss"}
          value={record.settled === 0 ? "—" : formatUnits(record.netUnits)}
          sub={`flat ${Number(FOLLOW_STAKE_UNITS).toFixed(2)}u a bet`}
        />
      </dl>

      {/* ------------------------------------------------------------- open */}
      <Card className="mt-8">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Riding right now</CardTitle>
            {player.open.length > 0 && (
              <Badge variant="pending">{player.open.length} open</Badge>
            )}
          </div>
          <CardDescription>
            Taken and not yet graded. A game that has kicked off stays here until
            an admin settles it — moving it sooner would be claiming a result
            nobody has entered.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {player.open.length === 0 ? (
            <p className="text-sm text-fg-muted">Nothing open.</p>
          ) : (
            <CardTable picks={player.open} />
          )}
        </CardContent>
      </Card>

      {/* ---------------------------------------------------------- history */}
      <section aria-labelledby="history-heading" className="mt-10">
        <h2 id="history-heading" className="text-sm font-semibold tracking-tight">
          History
        </h2>
        <p className="mt-1 max-w-2xl text-xs text-fg-subtle">
          Every settled bet they took, newest day first. The running total is
          theirs alone — it counts only the picks on this page, flat-staked, so it
          is not a slice of Oobee&apos;s record.
        </p>

        {player.days.length === 0 ? (
          <p className="mt-4 text-sm text-fg-muted">
            Nothing settled yet{followed > 0 ? " — everything they have taken is still open." : "."}
          </p>
        ) : (
          <div className="mt-4 space-y-8">
            {player.days.map((day) => (
              <div key={day.date}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="num text-sm font-medium text-fg">
                    {formatSlateDate(day.date)}
                  </h3>
                  <p className="flex items-baseline gap-3 text-xs">
                    <span className="text-fg-subtle">
                      {day.picks.length} bet{day.picks.length === 1 ? "" : "s"} ·{" "}
                      <span className="num">
                        {day.record.wins}–{day.record.losses}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "num font-medium",
                        day.record.netUnits > 0
                          ? "text-hit"
                          : day.record.netUnits < 0
                            ? "text-miss"
                            : "text-fg-muted",
                      )}
                    >
                      {formatUnits(day.record.netUnits)}
                    </span>
                    <span className="num text-fg-subtle">
                      running {formatUnits(day.cumulativeUnits)}
                    </span>
                  </p>
                </div>
                <div className="mt-2">
                  <CardTable picks={day.picks} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
