import { DEFAULT_LOCALE, localeConfig, type Locale } from "./config";

/**
 * Every Intl call in the app goes through here.
 *
 * Before this, four components each passed `timeZone: "UTC"` by hand and the
 * formatting locale was written out at each call site — so the product had no
 * way to change either.
 *
 * Every function takes the locale last and defaults it, so call sites that do
 * not have one yet keep working, and threading a per-account locale through
 * later is an argument rather than a rewrite. Times of day are not formatted
 * at call sites at all: <LocalTime> does it, in the viewer's zone.
 */

/** Formatters are expensive to construct and pure, so build each one once. */
const cache = new Map<string, Intl.DateTimeFormat>();

function memo(key: string, make: () => Intl.DateTimeFormat): Intl.DateTimeFormat {
  const hit = cache.get(key);
  if (hit) return hit;
  const made = make();
  cache.set(key, made);
  return made;
}

/* ------------------------------------------------------------- quantities */

/** American odds -> display string, always signed. */
export function formatOdds(price: number): string {
  return price > 0 ? `+${price}` : `${price}`;
}

/** Units -> display string, always signed, 2dp, e.g. "+1.35u" / "-1.00u". */
export function formatUnits(units: number): string {
  // Only the positive case needs a sign added; a negative number already
  // carries its own, and zero takes none.
  return `${units > 0 ? "+" : ""}${units.toFixed(2)}u`;
}

/**
 * A value already expressed in percentage points -> a signed percentage, e.g.
 * 3.2 -> "+3.2%", -1.4 -> "-1.4%". For edges, where the sign is the point.
 */
export function formatSignedPct(value: number, digits = 1): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

/**
 * A ratio in 0..1 -> an unsigned percentage, e.g. 0.538 -> "53.8%". For rates
 * — win rate, take-up, how often a tester follows — where a leading "+" would
 * read as a gain rather than a proportion.
 */
export function formatRate(ratio: number, digits = 1): string {
  return `${(ratio * 100).toFixed(digits)}%`;
}

/* ------------------------------------------------------------------ dates */

/**
 * Instants — a kick-off, when a post went up — are shown in the viewer's own
 * time zone. Only the browser knows that zone, so these take it as an option:
 * <LocalTime> (components/local-time.tsx) passes the browser's, and anything
 * rendered without one (the server's first render, an email) falls back to
 * the locale's zone, which is the slate's — the one the day headings use.
 */
interface InZone {
  /** IANA zone; the locale's when left out. */
  timeZone?: string;
}

/** "Wed, Jul 29" — the slate day, which is a date string, not an instant. */
export function formatSlateDate(dateStr: string, locale: Locale = DEFAULT_LOCALE): string {
  const { formats } = localeConfig(locale);
  // A calendar date, pinned to noon UTC and read back in UTC, so no zone can
  // move it to the day before or after.
  return memo(`slate:${formats}`, () =>
    new Intl.DateTimeFormat(formats, {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }),
  ).format(new Date(`${dateStr}T12:00:00Z`));
}

/** "Wed 4:15 PM" — kickoff, without the zone; pair it with `zoneLabel`. */
export function formatKickoff(at: Date, { timeZone }: InZone = {}, locale: Locale = DEFAULT_LOCALE): string {
  const { formats } = localeConfig(locale);
  const zone = timeZone ?? localeConfig(locale).timeZone;
  return memo(`kickoff:${formats}:${zone}`, () =>
    new Intl.DateTimeFormat(formats, {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
      timeZone: zone,
    }),
  ).format(at);
}

/** "Jul 29, 6:00 PM" — a date and time together, for the admin lists. */
export function formatDateTime(at: Date, { timeZone }: InZone = {}, locale: Locale = DEFAULT_LOCALE): string {
  const { formats } = localeConfig(locale);
  const zone = timeZone ?? localeConfig(locale).timeZone;
  return memo(`datetime:${formats}:${zone}`, () =>
    new Intl.DateTimeFormat(formats, {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
      timeZone: zone,
    }),
  ).format(at);
}

/** "Jul 29, 2026" — a calendar date with no time; "7/29/26" with `year: "2-digit"`, for a tight column. */
export function formatDate(
  at: Date,
  { year = "numeric", timeZone }: { year?: "numeric" | "2-digit" } & InZone = {},
  locale: Locale = DEFAULT_LOCALE,
): string {
  const { formats } = localeConfig(locale);
  const zone = timeZone ?? localeConfig(locale).timeZone;
  return memo(`date:${formats}:${zone}:${year}`, () =>
    new Intl.DateTimeFormat(
      formats,
      year === "2-digit"
        ? { day: "numeric", month: "numeric", year, timeZone: zone }
        : { day: "numeric", month: "short", year, timeZone: zone },
    ),
  ).format(at);
}

/** "4:15 PM · Jul 29, 2026" — the full stamp under a post, as X puts it. */
export function formatStamp(at: Date, { timeZone }: InZone = {}, locale: Locale = DEFAULT_LOCALE): string {
  const { formats } = localeConfig(locale);
  const zone = timeZone ?? localeConfig(locale).timeZone;
  const time = memo(`time:${formats}:${zone}`, () =>
    new Intl.DateTimeFormat(formats, { hour: "numeric", minute: "2-digit", timeZone: zone }),
  ).format(at);
  return `${time} · ${formatDate(at, { timeZone: zone }, locale)}`;
}

/**
 * X's relative time: "now", "42s", "5m", "3h", then the date — "Jul 29", or
 * "Jul 29, 2025" from another year. The date is the viewer's, so a post from
 * late last night says yesterday's date wherever they are.
 */
export function formatAgo(
  at: Date,
  now: Date,
  { timeZone }: InZone = {},
  locale: Locale = DEFAULT_LOCALE,
): string {
  const s = Math.max(0, Math.round((now.getTime() - at.getTime()) / 1000));
  if (s < 10) return "now";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  const { formats } = localeConfig(locale);
  const zone = timeZone ?? localeConfig(locale).timeZone;
  const year = (d: Date) =>
    memo(`year:${zone}`, () => new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: zone })).format(d);
  if (year(at) !== year(now)) return formatDate(at, { timeZone: zone }, locale);
  return memo(`daymonth:${formats}:${zone}`, () =>
    new Intl.DateTimeFormat(formats, { day: "numeric", month: "short", timeZone: zone }),
  ).format(at);
}

/**
 * The zone's short name at that instant — "EDT", "PST", "CEST", "BST" — so a
 * kick-off time is never ambiguous. American zones only have names in en-US
 * and European ones only in en-GB; anywhere else it is an offset ("GMT+9").
 */
export function zoneLabel(at: Date, { timeZone }: InZone = {}, locale: Locale = DEFAULT_LOCALE): string {
  const zone = timeZone ?? localeConfig(locale).timeZone;
  const name = (tag: string) =>
    memo(`zone:${tag}:${zone}`, () => new Intl.DateTimeFormat(tag, { timeZoneName: "short", timeZone: zone }))
      .formatToParts(at)
      .find((p) => p.type === "timeZoneName")?.value;
  const us = name("en-US");
  if (us && !us.startsWith("GMT")) return us;
  return name("en-GB") ?? us ?? zone;
}
