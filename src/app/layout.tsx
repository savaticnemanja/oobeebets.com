import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { SITE } from "@/lib/site";
import { Aurora } from "@/components/aurora";
import { ServiceWorker } from "@/components/pwa/service-worker";
import "./globals.css";

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
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: SITE.name,
    title: `${SITE.name} — ${SITE.tagline}`,
    description: SITE.description,
    url: SITE.url,
    locale: SITE.locale,
  },
  twitter: {
    card: "summary_large_image",
    site: SITE.twitter,
    creator: SITE.twitter,
    title: `${SITE.name} — ${SITE.tagline}`,
    description: SITE.description,
  },
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
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Aurora />
        <div className="grid-lines" aria-hidden="true" />

        {/* First focusable element on every page. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-[calc(1rem+var(--spacing-safe-top))] focus:z-100 focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-black"
        >
          Skip to content
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
