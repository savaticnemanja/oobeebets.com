"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatSlateDate } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";

/** Whole days between two YYYY-MM-DD slate dates (a minus b). */
function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86_400_000);
}

/** "Today", "Yesterday", or the plain slate date. */
function relativeLabel(date: string, today: string): string {
  const diff = dayDiff(today, date);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return formatSlateDate(date);
}

/**
 * Step through past slates: ‹ older · [date ▾] · newer ›, plus a way straight
 * back to today. The arrows walk the dates that actually have a slate rather
 * than calendar days, so they never land on an empty board.
 *
 * Today is always on the list, published or not — it is where an admin
 * previews a draft, and "back to today" has to have somewhere to go.
 */
export function SlateDatePicker({
  dates,
  current,
  today,
  /** Where the chosen date is applied. The admin follow report reads the same
   * `?date=` param off a different route, so the destination is a prop rather
   * than a hardcoded "/picks". */
  basePath = "/picks",
  /** Other query params to carry across a date change, e.g. the board tab, so
   * switching day doesn't also drop you back on the first tab. */
  keep = {},
}: {
  dates: string[];
  current: string;
  today: string;
  basePath?: string;
  keep?: Record<string, string | undefined>;
}) {
  const router = useRouter();

  // Newest first; today on top even before it is published.
  const all = [...new Set([today, current, ...dates])].sort().reverse();
  const i = all.indexOf(current);
  const newer = i > 0 ? all[i - 1] : null;
  const older = i < all.length - 1 ? all[i + 1] : null;

  const hrefFor = (d: string) => {
    const q = new URLSearchParams();
    // Today is the default, so it gets the clean URL.
    if (d !== today) q.set("date", d);
    for (const [k, v] of Object.entries(keep)) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `${basePath}?${s}` : basePath;
  };

  const step =
    "grid size-8 place-items-center rounded-lg border border-border text-fg-muted transition-colors";

  return (
    <div className="flex items-center gap-1.5">
      {older ? (
        <Link href={hrefFor(older)} aria-label={`Previous slate, ${formatSlateDate(older)}`} className={cn(step, "hover:border-border-strong hover:text-fg")}>
          <ChevronLeft className="size-4" aria-hidden="true" />
        </Link>
      ) : (
        <span aria-hidden="true" className={cn(step, "opacity-40")}>
          <ChevronLeft className="size-4" />
        </span>
      )}

      <Select value={current} onValueChange={(v) => router.push(hrefFor(v))}>
        {/* A Radix trigger is a button, so it is not one of the controls iOS
            zooms for — opt back out of touch:text-base, or 16px text would
            not fit the 2rem height. */}
        <SelectTrigger className="h-8 w-36 gap-2 text-xs touch:text-xs" aria-label="Choose a slate date">
          <CalendarDays className="size-3.5 shrink-0 text-fg-subtle" aria-hidden="true" />
          {/* Short in the trigger — the full date is in the list and in the
              page subtitle — so "Today · Mon 12 Oct" doesn't truncate. */}
          <span className="flex-1 truncate text-left">
            <SelectValue>{relativeLabel(current, today)}</SelectValue>
          </span>
        </SelectTrigger>
        <SelectContent>
          {all.map((d) => (
            <SelectItem key={d} value={d} className="text-xs">
              {d === today || dayDiff(today, d) === 1
                ? `${relativeLabel(d, today)} · ${formatSlateDate(d)}`
                : formatSlateDate(d)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {newer ? (
        <Link href={hrefFor(newer)} aria-label={`Next slate, ${formatSlateDate(newer)}`} className={cn(step, "hover:border-border-strong hover:text-fg")}>
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      ) : (
        <span aria-hidden="true" className={cn(step, "opacity-40")}>
          <ChevronRight className="size-4" />
        </span>
      )}

      {current !== today && (
        <Link
          href={hrefFor(today)}
          className="ml-1 h-8 rounded-lg border border-brand/30 bg-brand/10 px-3 text-xs font-medium leading-8 text-brand transition-colors hover:bg-brand/15"
        >
          Today
        </Link>
      )}
    </div>
  );
}
