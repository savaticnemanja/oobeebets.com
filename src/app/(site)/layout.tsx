import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { SmoothScroll } from "@/components/smooth-scroll";
import { AppShell } from "@/components/app-shell/app-shell";
import { displayNameOf } from "@/components/social/identity";
import { getAuth } from "@/lib/auth";

/**
 * Two layouts behind one route group. Signed out, the only pages open are the
 * landing page, About and the legal pages, and they wear the marketing header
 * and footer. Signed in, everything wears the X-style app shell.
 */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const auth = await getAuth();

  if (auth) {
    // --bottom-bar lifts anything pinned to the bottom (the install prompt)
    // above the phone's tab bar.
    return (
      <div className="[--bottom-bar:calc(3.5rem+var(--spacing-safe-bottom))] sm:[--bottom-bar:0px]">
        <AppShell
          user={{
            id: auth.user.id,
            name: displayNameOf(auth.user),
            username: auth.user.username,
            isAdmin: auth.isAdmin,
          }}
        >
          {children}
        </AppShell>
        <InstallPrompt />
      </div>
    );
  }

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
