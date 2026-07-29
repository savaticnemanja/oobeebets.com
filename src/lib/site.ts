/** Site-wide constants used by metadata, JSON-LD, sitemap and absolute URLs. */

export const SITE = {
  name: "oobee bets",
  shortName: "oobee",
  domain: "oobeebets.com",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://oobeebets.com",
  tagline: "Every pick, settled in public.",
  description:
    "Daily sports betting picks with a public, unedited track record. Every pick we publish is settled against the real final score — wins and losses both.",
  twitter: "@oobeebets",
  locale: "en_US",
  themeColor: "#000000",
  brandColor: "#22d3ee",
} as const;

export function appUrl(path = "/"): string {
  return new URL(path, SITE.url).toString();
}

export const NAV_PUBLIC = [
  { href: "/track-record", label: "Track record" },
  { href: "/pricing", label: "Pricing" },
  { href: "/about", label: "About" },
] as const;

export const NAV_APP = [
  { href: "/picks", label: "Picks" },
  { href: "/track-record", label: "Track record" },
  { href: "/account", label: "Account" },
] as const;

export const NAV_ADMIN = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/slate", label: "Publish slate" },
  { href: "/admin/settle", label: "Settle" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/settings", label: "Settings" },
] as const;
