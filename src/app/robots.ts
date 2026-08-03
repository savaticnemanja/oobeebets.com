import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

/**
 * Three pages exist and two of them are worth indexing.
 *
 * The long disallow list this replaced was aimed at a board, an account area
 * and an admin console that are not in this build. Naming routes that do not
 * exist tells a crawler nothing except that they might.
 */
const DISALLOWED = [
  "/api/",
  "/offline",
  // Reached from a tokenised link in an email, and nothing anyone should find
  // in search results.
  "/unsubscribe",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: DISALLOWED }],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
