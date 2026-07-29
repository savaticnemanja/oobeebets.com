import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE.name} — ${SITE.tagline}`,
    short_name: SITE.shortName,
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
    lang: "en",
    dir: "ltr",
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
      {
        name: "Track record",
        short_name: "Record",
        url: "/track-record",
        description: "Every settled pick",
      },
    ],
  };
}
