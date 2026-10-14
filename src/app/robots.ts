import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";
import { betaGatePassword } from "@/lib/beta-gate";
import { siteNoIndex } from "@/lib/indexing";

/**
 * Prerendered by default, which would freeze whichever answer was right at
 * build time. BETA_GATE_PASSWORD and SITE_NOINDEX arrive from the environment
 * at run time, so a static robots.txt would be generated with both off and
 * keep saying so on a deployment that sets them.
 */
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  // A gated deployment is a copy of the real site on a different hostname.
  // Every crawlable answer it could give is one production should be giving
  // instead, so it asks for nothing to be indexed at all — and omits the
  // sitemap, which would otherwise advertise the very routes being withheld.
  if (betaGatePassword()) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }

  // Open but noindex (see lib/indexing.ts). Crawling stays allowed on purpose:
  // the noindex travels in a response header, and a crawler barred by
  // robots.txt never fetches the page to read it — it can still list a bare
  // URL it found linked elsewhere, and beta's URLs get shared. No sitemap
  // either, since it would only advertise pages that ask not to be indexed.
  if (siteNoIndex()) {
    return { rules: [{ userAgent: "*", allow: "/" }] };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // The board is the product; crawlers have no business in it, and the
        // rest is per-user state that would only produce junk index entries.
        disallow: ["/picks", "/community", "/account", "/admin", "/api/", "/login", "/signup", "/offline"],
      },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
