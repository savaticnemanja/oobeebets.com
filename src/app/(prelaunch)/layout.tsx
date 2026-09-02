import { PrelaunchChrome } from "@/components/prelaunch-chrome";

/**
 * The pre-launch surface: the mailing-list signup at `/soon` and the
 * unsubscribe flow the welcome email links to.
 *
 * These keep their own chrome rather than the product's. `PrelaunchChrome` is a
 * logo and three footer links over plain document flow — no nav, no user menu,
 * no install prompt — which is what both of these pages want: one is read by
 * someone who has never seen the product, the other by someone arriving from an
 * email to leave. Neither is helped by a header offering /picks.
 *
 * It also renders its own `<main id="main">`, so this group must stay out of
 * `(site)` — two elements with the same id on one page is not a thing to ship.
 */
export default function PrelaunchLayout({ children }: { children: React.ReactNode }) {
  return <PrelaunchChrome>{children}</PrelaunchChrome>;
}
