import { PrelaunchChrome } from "@/components/prelaunch-chrome";

/**
 * The two pages that hold one screen: the signup and the unsubscribe form.
 *
 * The group exists only to pick a layout — it adds nothing to the URL, so the
 * signup still serves at `/` and not at a placeholder path that would get
 * shared, bookmarked and indexed and then need unwinding at launch.
 */
export default function ScreenLayout({ children }: { children: React.ReactNode }) {
  return <PrelaunchChrome fill>{children}</PrelaunchChrome>;
}
