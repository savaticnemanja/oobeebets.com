import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { SmoothScroll } from "@/components/smooth-scroll";
import { PrelaunchChrome } from "@/components/prelaunch-chrome";
import { PRELAUNCH } from "@/lib/prelaunch";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  // The gate lets the legal pages through, and they render in here. Giving them
  // the normal chrome would surround them with a header and footer whose every
  // link redirects back to the signup page.
  if (PRELAUNCH) return <PrelaunchChrome>{children}</PrelaunchChrome>;

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Public pages only. /admin is a tool people work in for an hour at a
          time, and putting a tenth of a second of easing between the wheel and
          a table of results makes it worse, not nicer. */}
      <SmoothScroll />
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
      <InstallPrompt />
    </div>
  );
}
