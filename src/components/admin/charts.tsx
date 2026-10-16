"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The console's two small charts, drawn in HTML rather than a chart library:
 * a day-by-day column chart with a hover/focus readout, and the mini columns
 * under a KPI. Columns are capped at 24px with a 2px gap between them, round
 * only at the data end, and grow from one baseline. Every value is also in a
 * visually hidden table, so the readout never gates a number.
 */

export interface ColumnDatum {
  key: string;
  /** The x label: "Oct 3". */
  label: string;
  value: number;
  /** A second line in the readout: "4 won · 2 lost". */
  detail?: string;
}

type Unit = "count" | "units";

function fmt(value: number, unit: Unit): string {
  if (unit === "units") return `${value > 0 ? "+" : ""}${value.toFixed(2)}u`;
  return value.toLocaleString("en-US");
}

/** Clean axis steps: 1, 2, 5 × 10ⁿ. */
function niceMax(max: number): number {
  if (max <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 2, 5, 10]) if (m * pow >= max) return m * pow;
  return 10 * pow;
}

export function ColumnChart({
  data,
  label,
  unit = "count",
  diverging = false,
  height = 168,
  className,
}: {
  data: ColumnDatum[];
  /** What is plotted, e.g. "Active accounts per day". Names the hidden table too. */
  label: string;
  unit?: Unit;
  /** Positive up in green, negative down in red, from a zero line. */
  diverging?: boolean;
  height?: number;
  className?: string;
}) {
  const [active, setActive] = React.useState<number | null>(null);
  const peak = Math.max(0, ...data.map((d) => Math.abs(d.value)));
  const top = unit === "units" ? Math.max(1, Math.ceil(peak)) : niceMax(peak);
  // Where zero sits, as a fraction from the top.
  const zero = diverging ? 0.5 : 1;
  const ticks = diverging ? [top, 0, -top] : [top, top / 2, 0];
  const shown = active !== null ? data[active] : null;

  const move = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    setActive((i) => {
      const from = i ?? (e.key === "ArrowRight" ? -1 : data.length);
      return Math.min(data.length - 1, Math.max(0, from + (e.key === "ArrowRight" ? 1 : -1)));
    });
  };

  return (
    <figure className={cn("relative select-none", className)}>
      <div className="flex gap-2">
        {/* y ticks */}
        <div className="relative w-9 shrink-0 text-right" style={{ height }} aria-hidden="true">
          {ticks.map((t, i) => (
            <span
              key={i}
              className="num absolute right-0 -translate-y-1/2 text-[0.6875rem] text-fg-subtle"
              style={{ top: `${(i / (ticks.length - 1)) * 100}%` }}
            >
              {unit === "units" ? (t > 0 ? `+${t}` : t < 0 ? `−${-t}` : "0") : Number.isInteger(t) ? t : t.toFixed(1)}
            </span>
          ))}
        </div>

        <div className="relative min-w-0 flex-1" style={{ height }}>
          {/* gridlines: hairline, solid, recessive; the zero line a step stronger */}
          {ticks.map((t, i) => (
            <span
              key={i}
              aria-hidden="true"
              className={cn("absolute inset-x-0 h-px", t === 0 ? "bg-border-strong" : "bg-border")}
              style={{ top: `${(i / (ticks.length - 1)) * 100}%` }}
            />
          ))}

          <div
            role="img"
            aria-label={`${label}. Use the arrow keys to read each day.`}
            tabIndex={0}
            onKeyDown={move}
            onBlur={() => setActive(null)}
            onPointerLeave={() => setActive(null)}
            className="absolute inset-0 flex gap-[2px] rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
          >
            {data.map((d, i) => {
              const h = top > 0 ? (Math.abs(d.value) / top) * (diverging ? 50 : 100) : 0;
              const negative = d.value < 0;
              return (
                <div
                  key={d.key}
                  onPointerEnter={() => setActive(i)}
                  className="relative flex h-full min-w-0 flex-1 justify-center"
                >
                  {active === i && <span aria-hidden="true" className="absolute inset-y-0 w-full rounded-sm bg-white/[0.04]" />}
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute w-full max-w-6 transition-[filter]",
                      d.value === 0
                        ? "h-[2px] bg-surface-3"
                        : diverging
                          ? negative
                            ? "rounded-b-[4px] bg-miss"
                            : "rounded-t-[4px] bg-hit"
                          : "rounded-t-[4px] bg-brand",
                      active === i && "brightness-125",
                    )}
                    style={
                      d.value === 0
                        ? { top: `calc(${zero * 100}% - 2px)` }
                        : negative
                          ? { top: `${zero * 100}%`, height: `${h}%` }
                          : { bottom: `${(1 - zero) * 100}%`, height: `${h}%` }
                    }
                  />
                </div>
              );
            })}
          </div>

          {/* the readout: value first, then the day */}
          {shown && active !== null && (
            <div
              aria-live="polite"
              className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-border-strong bg-surface-3 px-2.5 py-1.5 text-xs shadow-xl"
              style={{ left: `clamp(3.5rem, ${((active + 0.5) / data.length) * 100}%, calc(100% - 3.5rem))` }}
            >
              <p className="num font-semibold text-fg">{fmt(shown.value, unit)}</p>
              <p className="text-fg-muted">{shown.label}</p>
              {shown.detail && <p className="text-fg-subtle">{shown.detail}</p>}
            </div>
          )}
        </div>
      </div>

      {/* x labels: the ends and the middle */}
      {data.length > 0 && (
        <div className="ml-11 mt-2 flex justify-between text-[0.6875rem] text-fg-subtle" aria-hidden="true">
          <span>{data[0].label}</span>
          {data.length > 2 && <span>{data[Math.floor((data.length - 1) / 2)].label}</span>}
          <span>{data[data.length - 1].label}</span>
        </div>
      )}

      <table className="sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Value</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.key}>
              <th scope="row">{d.label}</th>
              <td>
                {fmt(d.value, unit)}
                {d.detail ? ` (${d.detail})` : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/**
 * The trend under a KPI: one column a day, the earlier days receding and the
 * period the KPI counts in the accent, so the tile's "this week vs last" is
 * also something you can see.
 */
export function MiniColumns({
  values,
  highlightLast,
  label,
}: {
  values: number[];
  /** How many of the last values are the KPI's own period. */
  highlightLast: number;
  label: string;
}) {
  const peak = Math.max(1, ...values);
  return (
    <span className="flex h-7 items-end gap-[2px]" role="img" aria-label={label}>
      {values.map((v, i) => (
        <span
          key={i}
          title={String(v)}
          className={cn(
            "min-w-0 flex-1 rounded-t-[2px]",
            i >= values.length - highlightLast ? "bg-brand" : "bg-surface-3",
          )}
          style={{ height: v === 0 ? "2px" : `${Math.max(8, (v / peak) * 100)}%` }}
        />
      ))}
    </span>
  );
}
