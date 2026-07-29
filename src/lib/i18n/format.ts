import { DEFAULT_LOCALE, localeConfig, type Locale } from "./config";

/**
 * Every Intl call in the app goes through here.
 *
 * Before this, money formatted as en-US, dates as en-GB, and four components
 * each passed `timeZone: "UTC"` by hand — so the product had two locales and no
 * way to change either. The output of all of these is byte-identical to what
 * those literals produced; the only thing that changed is that the locale is
 * now an argument.
 *
 * Every function takes the locale last and defaults it, so call sites that do
 * not have one yet keep working, and threading a per-account locale through
 * later is an argument rather than a rewrite.
 */

/** Formatters are expensive to construct and pure, so build each one once. */
const cache = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat>();

function memo<T extends Intl.NumberFormat | Intl.DateTimeFormat>(key: string, make: () => T): T {
  const hit = cache.get(key);
  if (hit) return hit as T;
  const made = make();
  cache.set(key, made);
  return made;
}

/* ------------------------------------------------------------------ money */

/**
 * `narrowSymbol` matters: the formatting locale is en-GB, and without it USD
 * renders as "US$29" rather than "$29".
 */
export function formatMoney(cents: number, locale: Locale = DEFAULT_LOCALE): string {
  const { formats, currency } = localeConfig(locale);
  const whole = cents % 100 === 0;
  return memo(`money:${formats}:${currency}:${whole}`, () =>
    new Intl.NumberFormat(formats, {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: whole ? 0 : 2,
    }),
  ).format(cents / 100);
}

/* ------------------------------------------------------------- quantities */

/** American odds -> display string, always signed. */
export function formatOdds(price: number): string {
  return price > 0 ? `+${price}` : `${price}`;
}

/** Units -> display string, always signed, 2dp, e.g. "+1.35u" / "-1.00u". */
export function formatUnits(units: number): string {
  const sign = units > 0 ? "+" : units < 0 ? "" : "";
  return `${sign}${units.toFixed(2)}u`;
}

export function formatPct(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
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
