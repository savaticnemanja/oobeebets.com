/** Site-wide constants used by metadata, JSON-LD, sitemap and absolute URLs. */

const DOMAIN = "oobeebets.com";

export const SITE = {
  name: "oobee bets",
  domain: DOMAIN,
  /**
   * The single address anyone is invited to write to, from any page.
   *
   * One inbox on purpose. The legal pages used to point at privacy@ and
   * hello@ separately, which asks a reader to work out which of their
   * questions is a privacy question — and splits a mailbox nobody has staffed
   * yet across two names.
   */
  supportEmail: `support@${DOMAIN}`,
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://oobeebets.com",
  tagline: "Every pick, settled in public.",
  description:
    "Daily sports betting picks with a public, unedited track record. Every pick we publish is settled against the real final score — wins and losses both.",
  twitter: "@oobeebets",
  // Locale lives in lib/i18n/config.ts — it is one value with several
  // representations (lang, og, Intl), and splitting it across two files is how
  // it drifted into en / en_US / en-GB in the first place.
  themeColor: "#000000",
  brandColor: "#22d3ee",
} as const;

export function appUrl(path = "/"): string {
  return new URL(path, SITE.url).toString();
}

/*
 * The NAV_PUBLIC / NAV_APP / NAV_ADMIN tables are gone with the header and
 * mobile nav that rendered them. Every entry pointed at a route this build no
 * longer serves, and the pre-launch footer names its three links directly.
 */
