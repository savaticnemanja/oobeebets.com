import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { SITE } from "@/lib/site";
import { shareCard } from "@/lib/metadata";
import { getLocale, localeConfig } from "@/lib/i18n/config";
import { Aurora } from "@/components/aurora";
import { ServiceWorker } from "@/components/pwa/service-worker";
import "./globals.css";
import { t } from "@/lib/i18n";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"], display: "swap" });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: `${SITE.name} — ${SITE.tagline}`,
    template: `%s · ${SITE.name}`,
  },
  description: SITE.description,
  applicationName: SITE.name,
  keywords: [
    "sports betting picks",
    "betting tips",
    "verified track record",
    "daily picks",
    "sports handicapping",
  ],
  authors: [{ name: SITE.name, url: SITE.url }],
  creator: SITE.name,
  publisher: SITE.name,
  // No canonical here. Metadata is inherited, so a root canonical is not a
  // default — it is an assertion every page without its own repeats verbatim,
  // and nine of them were declaring themselves to be the homepage. Each public
  // route sets its own; the home page's lives in (site)/page.tsx.
  // The evergreen card every page inherits unless it says otherwise.
  ...shareCard({ title: `${SITE.name} — ${SITE.tagline}`, description: SITE.description }),
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    // The home screen label when iOS installs from the meta tags rather than
    // the manifest; keep it in step with the manifest's short_name.
    title: SITE.name,
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
  category: "sports",
};

export const viewport: Viewport = {
  themeColor: SITE.themeColor,
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  // Never block zoom — pinch-to-zoom is an accessibility requirement, and
  // disabling it is the single most common a11y failure in PWAs.
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // `dir` was never set at all, and `lang` was the string "en" in the markup
  // while og:locale said en_US and the formatters said en-GB.
  const locale = localeConfig(getLocale());

  return (
    <html
      lang={locale.tag}
      dir={locale.dir}
      className="dark"
      suppressHydrationWarning
    >
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Aurora />
        <div className="grid-lines" aria-hidden="true" />

        {/* First focusable element on every page. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-[calc(1rem+var(--spacing-safe-top))] focus:z-100 focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-black"
        >
          {t().nav.skipToContent}
        </a>

        {children}

        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: "var(--color-surface-2)",
              border: "1px solid var(--color-border-strong)",
              color: "var(--color-fg)",
            },
          }}
        />
        <ServiceWorker />
      </body>
    </html>
  );
}
