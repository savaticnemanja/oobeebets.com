import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";
import { betaGatePassword } from "@/lib/beta-gate";

/**
 * Prerendered by default, which would freeze whichever answer was right at
 * build time. BETA_GATE_PASSWORD arrives from the environment at run time, so
 * a static robots.txt would be generated with the gate off and keep saying so
 * on a deployment that is gated.
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
