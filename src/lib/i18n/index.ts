import { DEFAULT_LOCALE, type Locale } from "./config";
import { en, type Messages } from "./messages/en";

export {
  DEFAULT_LOCALE,
  LOCALES,
  getLocale,
  isLocale,
  localeConfig,
  type Locale,
  type LocaleConfig,
} from "./config";
export type { Messages } from "./messages/en";

/**
 * Catalogues are imported statically, not loaded on demand. With one language
 * a dynamic import would buy nothing and cost a suspense boundary around every
 * string; when a second one lands, this record is where lazy loading goes if
 * the bundle ever justifies it.
 */
const CATALOGUES: Record<Locale, Messages> = { en };

/**
 * Messages for a locale.
 *
 * Returns the whole catalogue rather than resolving a dotted key at runtime,
 * so every lookup is a property access TypeScript can check: `t().status.won`
 * is a compile error the day `status.won` is renamed, where `t("status.won")`
 * would be a blank space on a page nobody looked at.
 */
export function t(locale: Locale = DEFAULT_LOCALE): Messages {
  return CATALOGUES[locale] ?? CATALOGUES[DEFAULT_LOCALE];
}
