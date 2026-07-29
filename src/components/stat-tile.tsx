import { cn, formatUnits } from "@/lib/utils";
import { CountUp } from "@/components/ui/motion";
import { MIN_SAMPLE_FOR_RATE } from "@/lib/settlement";
import type { WindowStats } from "@/lib/stats";

/**
 * A single number with its label. `tone` colours the value by result, and the
 * value is always paired with a word so colour is never the only signal.
 */
export function StatTile({
  label,
  value,
  sub,
  tone = "neutral",
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "neutral" | "hit" | "miss" | "brand";
  className?: string;
}) {
  return (
    <div className={cn("card-hairline p-4", className)}>
      <dt className="text-[0.6875rem] font-medium uppercase tracking-wider text-fg-subtle">
        {label}
      </dt>
      <dd
        className={cn(
          "num mt-1.5 text-2xl font-semibold tracking-tight",
          tone === "hit" && "text-hit",
          tone === "miss" && "text-miss",
          tone === "brand" && "text-brand",
          tone === "neutral" && "text-fg",
        )}
      >
        {value}
      </dd>
      {sub && <p className="mt-1 text-xs text-fg-muted">{sub}</p>}
    </div>
  );
}

/** Today / week / month / overall tile, as on the track record screen. */
export function WindowTile({ stats }: { stats: WindowStats }) {
  const net = stats.netUnits;
  return (
    <div className="card-hairline p-4">
      <p className="text-[0.6875rem] font-medium uppercase tracking-wider text-fg-subtle">
        {stats.label}
      </p>
      <p className="num mt-1.5 text-2xl font-semibold tracking-tight text-fg">
        {stats.wins}&ndash;{stats.losses}
      </p>
      <p
        className={cn(
          "num mt-1 text-sm font-medium",
          net > 0 ? "text-hit" : net < 0 ? "text-miss" : "text-fg-muted",
        )}
      >
        <CountUp value={net} decimals={2} prefix={net > 0 ? "+" : ""} suffix="u" />
      </p>
    </div>
  );
}

/**
 * Win rate, with the honesty rule baked in: under the minimum sample the
 * percentage is suppressed rather than printed small. A number that looks like
 * evidence but isn't is worse than no number.
 */
export function WinRateTile({ stats }: { stats: WindowStats }) {
  const rateable = stats.wins + stats.losses;
  return (
    <div className="card-hairline p-4">
      <p className="text-[0.6875rem] font-medium uppercase tracking-wider text-fg-subtle">
        Win rate
      </p>
      {stats.sampleTooSmall ? (
        <>
          <p className="num mt-1.5 text-2xl font-semibold tracking-tight text-fg-muted">
            {stats.wins}/{rateable}
          </p>
          <p className="mt-1 text-xs uppercase tracking-wider text-pending">
            Too few to be a rate
          </p>
        </>
      ) : (
        <>
          <p className="num mt-1.5 text-2xl font-semibold tracking-tight text-brand">
            {((stats.winRate ?? 0) * 100).toFixed(1)}%
          </p>
          <p className="mt-1 text-xs text-fg-muted">
            {stats.wins}&ndash;{stats.losses} over {rateable} picks
          </p>
        </>
      )}
    </div>
  );
}

/** Horizontal bar for the confidence-bucket breakdown. */
export function RateBar({
  label,
  rate,
  sample,
  tooSmall,
}: {
  label: string;
  rate: number | null;
  sample: number;
  tooSmall: boolean;
}) {
  const pct = (rate ?? 0) * 100;

  // Below the minimum sample the bar shows progress toward being measurable
  // (sample / 30), not the hit rate. Drawing the bar at the rate's width while
  // the label refuses to print that rate would imply the very number the
  // sample-size rule exists to withhold.
  const fill = tooSmall
    ? Math.min(100, (sample / MIN_SAMPLE_FOR_RATE) * 100)
    : pct;

  return (
    <div className="flex items-center gap-3">
      <span className="num w-16 shrink-0 text-xs text-fg-subtle">{label}</span>
      <div
        className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2"
        role="meter"
        aria-valuenow={Math.round(tooSmall ? sample : pct)}
        aria-valuemin={0}
        aria-valuemax={tooSmall ? MIN_SAMPLE_FOR_RATE : 100}
        aria-label={
          tooSmall
            ? `${label}: ${sample} of ${MIN_SAMPLE_FOR_RATE} picks needed before a rate is shown`
            : `${label} hit rate`
        }
      >
        <div
          className={cn(
            "h-full rounded-full transition-all duration-700",
            tooSmall
              ? "bg-fg-subtle"
              : pct >= 55
                ? "bg-hit"
                : pct >= 45
                  ? "bg-pending"
                  : "bg-miss",
          )}
          style={{ width: `${Math.max(fill, sample > 0 ? 3 : 0)}%` }}
        />
      </div>
      <span className="num w-28 shrink-0 text-right text-xs text-fg-muted">
        {sample === 0
          ? "—"
          : tooSmall
            ? `${sample}/${MIN_SAMPLE_FOR_RATE} picks`
            : `${pct.toFixed(0)}% (${sample})`}
      </span>
    </div>
  );
}

export { formatUnits };
