import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { SmoothScroll } from "@/components/smooth-scroll";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
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
