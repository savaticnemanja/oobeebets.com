/**
 * The one place that knows what a locale means here.
 *
 * There is exactly one language today, and the point of this file is that
 * adding a second is a matter of adding an entry and a message catalogue —
 * not of hunting down `"en-GB"` and `timeZone: "UTC"` scattered through
 * components, which is how it was before.
 *
 * Language and formatting are separate fields on purpose. This product writes
 * American English copy ("Soccer", "Football" for the NFL), prices in dollars,
 * and prints dates day-first — `en` for the content, `en-GB` for the numbers.
 * Collapsing the two would silently change what every date on the site says.
 */
export const LOCALES = ["en"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export interface LocaleConfig {
  /** BCP-47 tag for <html lang>. */
  readonly tag: string;
  /** Underscored variant Open Graph wants. */
  readonly ogLocale: string;
  readonly dir: "ltr" | "rtl";
  /**
   * Tag handed to Intl. Regional rather than linguistic: it decides date order
   * and number separators, not which words are used.
   */
  readonly formats: string;
  /**
   * IANA zone every date is rendered in. Currently UTC for everyone, printed
   * with the zone name beside it so nobody has to guess. This is the field a
   * per-account time zone would override.
   */
  readonly timeZone: string;
  /** Shown beside the zone so a time is never ambiguous. */
  readonly timeZoneLabel: string;
  /** ISO 4217. Prices are stored in cents of this. */
  readonly currency: string;
}

export const LOCALE_CONFIG: Record<Locale, LocaleConfig> = {
  en: {
    tag: "en",
    ogLocale: "en_US",
    dir: "ltr",
    formats: "en-GB",
    timeZone: "UTC",
    timeZoneLabel: "UTC",
    currency: "USD",
  },
};

export function localeConfig(locale: Locale = DEFAULT_LOCALE): LocaleConfig {
  return LOCALE_CONFIG[locale] ?? LOCALE_CONFIG[DEFAULT_LOCALE];
}

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/**
 * The locale for the current render — the single seam a second language plugs
 * into.
 *
 * Called with nothing it answers with the default, which is what the root
 * layout does. That is deliberate rather than lazy: reading `headers()` opts a
 * route into dynamic rendering, and paying that on every page to learn
 * something that cannot vary while `LOCALES` has one entry is a straight loss.
 *
 * Once there is a second language, callers pass what they know — an
 * Accept-Language header, a cookie, or the account's saved preference — and
 * negotiation happens here rather than in a new mechanism somewhere else.
 */
export function getLocale(acceptLanguage?: string | null): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;

  // q-values in descending order; the header is already roughly sorted, and
  // being exactly right about ties matters less than picking a supported tag.
  const tags = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.split(";");
      const q = params.find((p) => p.trim().startsWith("q="));
      return { tag: tag.trim().toLowerCase(), q: q ? Number(q.split("=")[1]) || 0 : 1 };
    })
    .sort((a, b) => b.q - a.q);

  for (const { tag } of tags) {
    if (isLocale(tag)) return tag;
    // "en-GB" should match the "en" catalogue.
    const base = tag.split("-")[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}
