import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { FollowBreakdown } from "@/lib/stats";
import { formatUnits } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";

/**
 * "Which types of bets do users follow most" — one slice of the board per row.
 *
 * Rendered three times on /admin/follows (board, bet type, league) off the same
 * shape, which is why it is a component rather than markup repeated with the
 * column headers changed twice.
 *
 * The column that actually answers the question is the last-but-two: raw follow
 * counts only rank slices by how often they were *published*, so `lift` divides
 * each slice's share of the follows by its share of the picks. A full page of
 * props and no game bets would otherwise read as "testers love props".
 */
export function FollowBreakdownTable({
  rows,
  dimension,
}: {
  rows: FollowBreakdown[];
  /** Column header for the first column, e.g. "Board", "Bet type". */
  dimension: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-fg-muted">Nothing published yet.</p>;
  }

  return (
    <div className="card-hairline overflow-hidden">
      <Table className="min-w-[34rem]">
        <TableHeader>
          <TableRow>
            <TableHead scope="col">{dimension}</TableHead>
            <TableHead scope="col" className="text-right">
              Published
            </TableHead>
            <TableHead scope="col" className="text-right">
              Followed
            </TableHead>
            <TableHead scope="col" className="text-right">
              vs. share
            </TableHead>
            <TableHead scope="col" className="text-right">
              W–L
            </TableHead>
            <TableHead scope="col" className="text-right">
              Net
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.key}>
              <TableCell className="text-fg">{r.label}</TableCell>
              <TableCell className="num text-right text-fg-muted">{r.picks}</TableCell>
              <TableCell className="num text-right text-fg">{r.follows}</TableCell>
              <TableCell
                className={cn(
                  "num text-right",
                  // Above or below its weight, not good or bad — so this is
                  // brand/muted rather than the hit/miss pair, which on this
                  // page means won and lost.
                  r.lift === null
                    ? "text-fg-subtle"
                    : r.lift >= 1.1
                      ? "text-brand"
                      : "text-fg-muted",
                )}
              >
                {r.lift === null ? "—" : `${r.lift.toFixed(2)}×`}
              </TableCell>
              <TableCell className="num text-right text-fg-muted">
                {r.follows === 0 ? "—" : `${r.record.wins}–${r.record.losses}`}
              </TableCell>
              <TableCell
                className={cn(
                  "num text-right font-medium",
                  r.record.settled === 0
                    ? "text-fg-subtle"
                    : r.record.netUnits > 0
                      ? "text-hit"
                      : r.record.netUnits < 0
                        ? "text-miss"
                        : "text-fg-muted",
                )}
              >
                {r.record.settled === 0 ? "—" : formatUnits(r.record.netUnits)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
