/**
 * Slate-day arithmetic.
 *
 * A betting day is not a calendar day. A West-coast game tipping off at 22:30
 * local finishes after midnight UTC, and it belongs to the day it started. The
 * boundary is 04:00 in SLATE_TIMEZONE, which puts every North American night
 * game on the correct date. This is FSD open question O2 — the boundary is one
 * constant, so changing it is a one-line change.
 */
// `||` rather than `??` — see the note in lib/site.ts: an unset build arg
// leaves an empty string, and Intl rejects "" as a time zone.
export const SLATE_TIMEZONE = process.env.NEXT_PUBLIC_SLATE_TZ || "America/New_York";
export const SLATE_DAY_BOUNDARY_HOUR = 4;

/** Offset of a timezone from UTC, in minutes, at a given instant. */
function tzOffsetMinutes(instant: Date, timeZone: string): number {
  // Formatting the same instant in UTC and in the target zone, then diffing,
  // is the only DST-correct way to do this without a date library.
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUTC = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );
  return (asUTC - instant.getTime()) / 60000;
}

/** The slate date (YYYY-MM-DD) that an instant belongs to. */
export function slateDateString(instant: Date = new Date()): string {
  const offset = tzOffsetMinutes(instant, SLATE_TIMEZONE);
  const local = new Date(instant.getTime() + offset * 60000);
  // Shift back by the boundary hour so 00:00–03:59 counts as the previous day.
  local.setUTCHours(local.getUTCHours() - SLATE_DAY_BOUNDARY_HOUR);
  return local.toISOString().slice(0, 10);
}

/** UTC instant at which the slate day containing `instant` began. */
export function startOfSlateDay(instant: Date = new Date()): Date {
  return new Date(`${slateDateString(instant)}T00:00:00Z`);
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isValidSlateDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`));
}

/**
 * Interprets a `<input type="datetime-local">` value ("YYYY-MM-DDTHH:mm", no
 * timezone) as wall-clock time in `timeZone` and returns the matching UTC
 * instant.
 *
 * `datetime-local` carries no timezone of its own — `new Date(value)` reads
 * it in whatever zone the *server* process happens to run in, which is UTC
 * on most deployments. An admin typing a 7pm ET kickoff would silently get
 * stored as 7pm UTC (3pm ET) instead. This forces the one timezone kickoffs
 * are actually entered in, regardless of where the app is deployed.
 */
export function zonedTimeToUtc(local: string, timeZone: string = SLATE_TIMEZONE): Date {
  const naiveUtc = new Date(`${local}:00Z`);
  const offset = tzOffsetMinutes(naiveUtc, timeZone);
  return new Date(naiveUtc.getTime() - offset * 60000);
}

// formatSlateDate lives in lib/i18n/format.ts. This module is the slate-day
// calendar — which UTC instant a betting day starts at — and that is fixed by
// the product, not by the reader's locale.
