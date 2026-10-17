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
 *   kickoff   "Tue 10:30 PM EDT", with the zone, since that's what you plan by
 *   ago       X's "5m", "3h", "Oct 13", with the full stamp as its tooltip
 *   stamp     "10:30 PM · Oct 13, 2026", under a post on its own page
 *   datetime  "Oct 13, 10:30 PM", the admin lists
 *   date      "Oct 13, 2026" ("10/13/26" with year="2-digit")
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
        ? formatAgo(at, new Date(), z)
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
      // The browser's first render can't be trusted to match the server's
      // text exactly — "5m ago" is measured from two different nows, and
      // engines differ on the space before AM/PM (a narrow no-break space in
      // newer ones). It is replaced straight after hydrating anyway.
      suppressHydrationWarning
    >
      {text}
    </time>
  );
}
