import type { Metadata } from "next";
import { t } from "@/lib/i18n";
import { localeConfig } from "@/lib/i18n/config";

/** Site-wide constants used by metadata, JSON-LD, sitemap and absolute URLs. */

export const SITE = {
  name: "oobee bets",
  domain: "oobeebets.com",
  // `||`, not `??`: NEXT_PUBLIC_* is inlined at build time, and an image built
  // without the build arg carries an empty string here rather than nothing at
  // all. `??` would keep that empty string, and `new URL(path, "")` throws.
  url: process.env.NEXT_PUBLIC_SITE_URL || "https://oobeebets.com",
  tagline: "Every pick, settled on the record.",
  description:
    "NFL betting picks with an unedited track record. Every pick we publish is settled against the real final score — wins and losses both.",
  twitter: "@oobeebets",
  supportEmail: "support@oobeebets.com",
  // Locale lives in lib/i18n/config.ts — it is one value with several
  // representations (lang, og, Intl), and splitting it across two files is how
  // it drifted into en / en_US / en-GB in the first place.
  themeColor: "#000000",
  brandColor: "#22d3ee",
} as const;

export function appUrl(path = "/"): string {
  return new URL(path, SITE.url).toString();
}

/**
 * Open Graph and Twitter tags for one public page. Metadata merges shallowly:
 * a page that sets `openGraph` at all replaces the root layout's whole object,
 * and one that doesn't inherits the home page's title and URL — which is how
 * a shared About link came to unfurl as the home page. So each public page
 * passes its own, and this carries the site-wide fields along.
 */
export function pageSocial(path: string, title: string, description: string): Pick<Metadata, "openGraph" | "twitter"> {
  return {
    openGraph: {
      type: "website",
      siteName: SITE.name,
      locale: localeConfig().ogLocale,
      title,
      description,
      url: appUrl(path),
    },
    twitter: { card: "summary_large_image", site: SITE.twitter, title, description },
  };
}

/**
 * Shown to every visitor, so everything here has to open without a session.
 * /picks is gated now — advertising it to a signed-out
 * visitor just bounces them to /login — so it lives in NAV_APP.
 */
export const NAV_PUBLIC = [
  { href: "/about", label: t().nav.about },
] as const;

/** The signed-in surfaces. */
export const NAV_APP = [
  { href: "/home", label: t().nav.home },
  { href: "/picks", label: t().nav.picks },
  { href: "/account", label: t().nav.account },
] as const;

