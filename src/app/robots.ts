import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";
import { PRELAUNCH } from "@/lib/prelaunch";

// The board is the product; crawlers have no business in it, and the rest is
// per-user state that would only produce junk index entries.
const ALWAYS_DISALLOWED = [
  "/picks",
  "/account",
  "/admin",
  "/api/",
  "/login",
  "/signup",
  "/offline",
];

/**
 * While the gate is up these all 307 to `/`. Crawlers would follow that and
 * work it out eventually, but saying so directly keeps them from spending the
 * budget and from recording redirects against URLs we want ranking at launch.
 */
const PRELAUNCH_DISALLOWED = [
  "/pricing",
  "/about",
  "/track-record",
  "/unsubscribe",
  // The rewrite target behind `/`. Indexing it would split the home page in two.
  "/soon",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: PRELAUNCH
          ? [...ALWAYS_DISALLOWED, ...PRELAUNCH_DISALLOWED]
          : ALWAYS_DISALLOWED,
      },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
