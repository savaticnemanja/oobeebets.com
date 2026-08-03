import { PrelaunchChrome } from "@/components/prelaunch-chrome";

/**
 * The legal pages, which run well past a screen and so scroll the page rather
 * than pinning the chrome to the viewport.
 */
export default function DocumentLayout({ children }: { children: React.ReactNode }) {
  return <PrelaunchChrome>{children}</PrelaunchChrome>;
}
