import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // The board is the product; crawlers have no business in it, and the
        // rest is per-user state that would only produce junk index entries.
        disallow: ["/picks", "/account", "/admin", "/api/", "/login", "/signup", "/offline"],
      },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
