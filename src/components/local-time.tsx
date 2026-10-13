"use client";

import { useSyncExternalStore } from "react";
import {
  formatAgo,
  formatDate,
  formatDateTime,
  formatKickoff,
  formatStamp,
  zoneLabel,
} from "@/lib/i18n/format";

/**
 * A moment — a kick-off, when a post went up — in the viewer's own time zone.
 *
 * Every time on the site used to be UTC, which put a 22:30 New York game at
 * "Wed 02:30 UTC" under a heading that says "Today · Tue". Only the browser
 * knows the viewer's zone, so the server renders in the slate's zone (the one
 * the day headings use) and the browser's first render matches it; straight
 * after hydrating, it renders again in the browser's zone. Mounted later — a
 * client navigation, a page infinite scroll appended — it starts there.
 *
 *   kickoff   "Tue 22:30 EDT", with the zone, since that's what you plan by
 *   ago       X's "5m", "3h", "13 Oct", with the full stamp as its tooltip
 *   stamp     "22:30 · 13 Oct 2026", under a post on its own page
 *   datetime  "13 Oct, 22:30", the admin lists
 *   date      "13 Oct 2026"
 */
export type TimeFormat = "kickoff" | "ago" | "stamp" | "datetime" | "date";

const subscribe = () => () => {};
const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
/** Unknown on the server, so the formatters fall back to the slate's zone. */
const noZone = () => undefined;

/** The viewer's IANA zone in the browser; undefined on the server and while hydrating. */
export function useViewerZone(): string | undefined {
  return useSyncExternalStore(subscribe, browserZone, noZone);
}

export function LocalTime({
  at,
  format,
  year,
  className,
}: {
  at: Date;
  format: TimeFormat;
  /** For `date`: "2-digit" in a tight table column. */
  year?: "numeric" | "2-digit";
  className?: string;
}) {
  const timeZone = useViewerZone();
  const z = { timeZone };
  const text =
    format === "kickoff"
      ? `${formatKickoff(at, z)} ${zoneLabel(at, z)}`
      : format === "ago"
        ? // Measured from now, and the server's now and the browser's differ
          // by the trip between them — hence suppressHydrationWarning below.
          formatAgo(at, new Date(), z)
        : format === "stamp"
          ? formatStamp(at, z)
          : format === "datetime"
            ? formatDateTime(at, z)
            : formatDate(at, { ...z, year });

  return (
    <time
      dateTime={at.toISOString()}
      title={format === "ago" ? `${formatStamp(at, z)} ${zoneLabel(at, z)}` : undefined}
      className={className}
      suppressHydrationWarning={format === "ago"}
    >
      {text}
    </time>
  );
}
