import { Aurora } from "@/components/aurora";
import { PrelaunchChrome } from "@/components/prelaunch-chrome";

/**
 * The homepage and the launch list's unsubscribe page: main's pre-launch
 * chrome, with the aurora and grid behind it that main drew from its root
 * layout. Kept to this group so the app's pages keep their own shell.
 */
export default function LaunchLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Aurora />
      <div className="grid-lines" aria-hidden="true" />
      <PrelaunchChrome>{children}</PrelaunchChrome>
    </>
  );
}
