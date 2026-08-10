import type { Metadata } from "next";
import { SITE } from "@/lib/site";
import { getLocale, localeConfig } from "@/lib/i18n/config";

/**
 * The share card, in one place, because Next replaces these objects instead of
 * merging them.
 *
 * A page that sets `openGraph: { title }` does not inherit the rest of the
 * root layout's openGraph — it drops og:type, og:site_name, og:locale and the
 * image, and the matching `twitter` override silently downgrades
 * twitter:card from summary_large_image to summary. The failure is invisible
 * in the page source you are looking at and only shows up in a share preview.
 *
 * So overriding the copy means restating the card, and restating it by hand in
 * each page is how the two drift apart. Callers pass the two fields that vary
 * and get a complete, consistent card back.
 */
export function shareCard({
  title,
  description,
  /**
   * The page's own URL, matching its canonical.
   *
   * Omitted at the root, and that is the point: og:url is the identity a
   * scraper files the share under, so a single inherited value meant a share
   * of the privacy policy resolved as the home page. Left out, the scraper
   * uses the URL it fetched, which is right for every page that has not
   * claimed otherwise.
   */
  path,
}: {
  title: string;
  description: string;
  path?: string;
}): Pick<Metadata, "openGraph" | "twitter"> {
  return {
    openGraph: {
      type: "website",
      siteName: SITE.name,
      title,
      description,
      ...(path ? { url: path } : {}),
      locale: localeConfig(getLocale()).ogLocale,
      // Explicit, because the file-based opengraph-image in app/ is only
      // attached automatically to metadata this does not override.
      images: [
        {
          url: "/opengraph-image",
          width: 1200,
          height: 630,
          alt: `${SITE.name} — ${SITE.tagline}`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      site: SITE.twitter,
      creator: SITE.twitter,
      title,
      description,
      images: ["/opengraph-image"],
    },
  };
}
