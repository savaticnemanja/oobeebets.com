import { DEFAULT_LOCALE, localeConfig, type Locale } from "./config";

/**
 * Every Intl call in the app goes through here.
 *
 * Before this, four components each passed `timeZone: "UTC"` by hand and the
 * formatting locale was written out at each call site — so the product had no
 * way to change either. The output is byte-identical to what those literals
 * produced; the only thing that changed is that the locale is now an argument.
 *
 * Every function takes the locale last and defaults it, so call sites that do
 * not have one yet keep working, and threading a per-account locale through
 * later is an argument rather than a rewrite.
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

/** "Wed 29 Jul" — the slate day, which is a date string, not an instant. */
export function formatSlateDate(dateStr: string, locale: Locale = DEFAULT_LOCALE): string {
  const { formats, timeZone } = localeConfig(locale);
  return memo(`slate:${formats}:${timeZone}`, () =>
    new Intl.DateTimeFormat(formats, {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone,
    }),
  ).format(new Date(`${dateStr}T12:00:00Z`));
}

/** "Wed 16:15" — kickoff, without the zone; pair it with `timeZoneLabel`. */
export function formatKickoff(at: Date, locale: Locale = DEFAULT_LOCALE): string {
  const { formats, timeZone } = localeConfig(locale);
  return memo(`kickoff:${formats}:${timeZone}`, () =>
    new Intl.DateTimeFormat(formats, {
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone,
    }),
  ).format(at);
}

/**
 * "29 Jul, 18:00" — a date and time together, for the admin lists.
 *
 * Those two call sites passed no `timeZone` at all, so they rendered in
 * whatever zone the server happened to run in while every public page said
 * UTC. Pinning them to the locale's zone is the point of routing them here.
 */
export function formatDateTime(at: Date, locale: Locale = DEFAULT_LOCALE): string {
  const { formats, timeZone } = localeConfig(locale);
  return memo(`datetime:${formats}:${timeZone}`, () =>
    new Intl.DateTimeFormat(formats, {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone,
    }),
  ).format(at);
}

/** "29 Jul 2026" — a calendar date with no time, e.g. a renewal date. */
export function formatDate(
  at: Date,
  { year = "numeric" }: { year?: "numeric" | "2-digit" } = {},
  locale: Locale = DEFAULT_LOCALE,
): string {
  const { formats, timeZone } = localeConfig(locale);
  return memo(`date:${formats}:${timeZone}:${year}`, () =>
    new Intl.DateTimeFormat(formats, {
      day: year === "2-digit" ? "2-digit" : "numeric",
      month: "short",
      year,
      timeZone,
    }),
  ).format(at);
}

/** The zone every time on the page is expressed in, e.g. "UTC". */
export function timeZoneLabel(locale: Locale = DEFAULT_LOCALE): string {
  return localeConfig(locale).timeZoneLabel;
}
