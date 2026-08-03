import { PrelaunchChrome } from "@/components/prelaunch-chrome";

/**
 * Every page that gets the site chrome: the signup at `/`, the unsubscribe
 * flow and the legal pages.
 *
 * The group adds nothing to any URL — it exists so `/offline` can stay out of
 * it. That page renders its own `<main id="main">` for the case where the
 * network is gone and the chrome's footer links would lead nowhere, and two
 * elements with the same id on one page is not a thing to ship.
 *
 * This was two groups, `(screen)` and `(document)`, one pinned to the viewport
 * and one scrolling. Now that every page scrolls with the footer held to the
 * bottom, they had identical layouts and the split earned nothing.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <PrelaunchChrome>{children}</PrelaunchChrome>;
}
