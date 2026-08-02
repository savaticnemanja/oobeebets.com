import { PrelaunchChrome } from "@/components/prelaunch-chrome";

/**
 * Both pages in here — the signup and the unsubscribe form — are short enough
 * to hold on one screen, so the chrome is pinned to the viewport and the page
 * never scrolls. The legal pages are not in this group and keep the default.
 */
export default function PrelaunchLayout({ children }: { children: React.ReactNode }) {
  return <PrelaunchChrome fill>{children}</PrelaunchChrome>;
}
