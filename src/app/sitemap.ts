import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

/**
 * The three indexable pages, and no database read to produce them.
 *
 * The version this replaced dated the home page from the newest settled pick
 * and the newest published slate. Neither table is in this build, and neither
 * would have anything in it if it were: nothing has been published yet. The
 * elaborate build-time fallbacks that went with those reads are gone for the
 * same reason.
 *
 * `lastModified` is therefore the deploy time, which is honestly what it is —
 * these are static pages whose copy changes when the site is deployed.
 */
export const revalidate = 3600;

export default function sitemap(): MetadataRoute.Sitemap {
  const built = new Date();

  return [
    { url: SITE.url, lastModified: built, changeFrequency: "weekly", priority: 1 },
    {
      url: `${SITE.url}/legal/terms`,
      lastModified: built,
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: `${SITE.url}/legal/privacy`,
      lastModified: built,
      changeFrequency: "yearly",
      priority: 0.2,
    },
  ];
}
