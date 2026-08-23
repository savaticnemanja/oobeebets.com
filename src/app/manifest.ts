import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";
import { getLocale, localeConfig } from "@/lib/i18n/config";

export default function manifest(): MetadataRoute.Manifest {
  const locale = localeConfig(getLocale());

  return {
    // Both are the plain brand name: `name` is what an install prompt shows,
    // `short_name` is the label under the home screen icon. The tagline lives
    // in `description`, where a long string is not truncated to nothing.
    name: SITE.name,
    short_name: SITE.name,
    description: SITE.description,
    start_url: "/picks",
    // Installed app opens without browser chrome; falls back gracefully on
    // platforms that don't support the window-controls-overlay display mode.
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone", "browser"],
    orientation: "portrait-primary",
    background_color: SITE.themeColor,
    theme_color: SITE.themeColor,
    categories: ["sports", "finance"],
    lang: locale.tag,
    dir: locale.dir,
    scope: "/",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      {
        name: "Today's picks",
        short_name: "Picks",
        url: "/picks",
        description: "Today's board",
      },
    ],
  };
}
