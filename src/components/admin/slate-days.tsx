"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollActiveTab } from "@/components/ui/scroll-active-tab";
import { cn } from "@/lib/utils";

export interface DayChip {
  day: string;
  games: number;
  published: boolean;
  picks: number;
  parlays: number;
}

function parts(day: string) {
  const d = new Date(`${day}T12:00:00Z`);
  return {
    weekday: new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(d),
    date: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(d),
  };
}

function shift(day: string, by: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
}

/**
 * The builder's days: every game day in the week around the one open, with
 * what's on it — live, a draft and how many picks, or nothing yet — so a
 * forgotten draft is visible from any day. Arrows step a day at a time; the
 * date field jumps anywhere. Changing day keeps the tab you were on.
 */
export function SlateDays({
  days,
  current,
  today,
  category,
}: {
  days: DayChip[];
  current: string;
  today: string;
  category: string;
}) {
  const router = useRouter();
  const href = (day: string) => `/admin/slate?date=${day}&category=${category}`;
  const list = days.some((d) => d.day === current)
    ? days
    : [...days, { day: current, games: 0, published: false, picks: 0, parlays: 0 }].sort((a, b) => a.day.localeCompare(b.day));

  return (
    <div className="mb-4 flex items-stretch gap-2">
      <Link
        href={href(shift(current, -1))}
        aria-label="Previous day"
        className="grid w-9 shrink-0 place-items-center rounded-xl border border-border text-fg-muted transition-colors hover:border-border-strong hover:text-fg"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
      </Link>

      <nav aria-label="Game days" className="relative min-w-0 flex-1 overflow-x-auto overscroll-x-contain">
        <ScrollActiveTab />
        <ul className="flex min-w-max gap-2">
          {list.map((d) => {
            const active = d.day === current;
            const { weekday, date } = parts(d.day);
            const total = d.picks + d.parlays;
            const state = d.published ? "Live" : total > 0 ? `Draft · ${total}` : d.games > 0 ? "Empty" : "No games";
            return (
              <li key={d.day}>
                <Link
                  href={href(d.day)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex w-[6.5rem] flex-col rounded-xl border px-3 py-2 text-left transition-colors",
                    active
                      ? "border-brand/60 bg-brand/[0.07]"
                      : "border-border hover:border-border-strong hover:bg-white/[0.02]",
                  )}
                >
                  <span className="flex items-baseline justify-between gap-1">
                    <span className={cn("text-xs font-medium", active ? "text-brand" : "text-fg")}>
                      {d.day === today ? "Today" : weekday}
                    </span>
                    <span className="num text-[0.6875rem] text-fg-subtle">{date}</span>
                  </span>
                  <span className="mt-1 flex items-center gap-1.5 text-[0.6875rem]">
                    <span
                      aria-hidden="true"
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        d.published ? "bg-hit" : total > 0 ? "bg-pending" : "bg-fg-subtle/40",
                      )}
                    />
                    <span className={cn(d.published ? "text-hit" : total > 0 ? "text-pending" : "text-fg-subtle")}>
                      {state}
                    </span>
                  </span>
                  <span className="num mt-0.5 text-[0.6875rem] text-fg-subtle">
                    {d.games} {d.games === 1 ? "game" : "games"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <Link
        href={href(shift(current, 1))}
        aria-label="Next day"
        className="grid w-9 shrink-0 place-items-center rounded-xl border border-border text-fg-muted transition-colors hover:border-border-strong hover:text-fg"
      >
        <ChevronRight className="size-4" aria-hidden="true" />
      </Link>

      <Input
        type="date"
        value={current}
        onChange={(e) => e.target.value && router.push(href(e.target.value))}
        aria-label="Slate date"
        className="num hidden h-10 w-40 shrink-0 self-center sm:block"
      />
    </div>
  );
}
