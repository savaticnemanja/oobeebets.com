import { t } from "@/lib/i18n";

/** Site-wide constants used by metadata, JSON-LD, sitemap and absolute URLs. */

export const SITE = {
  name: "oobee bets",
  domain: "oobeebets.com",
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

export const NAV_PUBLIC = [
  { href: "/top-picks", label: t().nav.topPicks },
  { href: "/about", label: t().nav.about },
] as const;

export const NAV_APP = [
  { href: "/picks", label: t().nav.picks },
  { href: "/account", label: t().nav.account },
] as const;

export const NAV_ADMIN = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/slate", label: "Publish slate" },
  { href: "/admin/settle", label: "Settle" },
  { href: "/admin/users", label: "Users" },
] as const;
