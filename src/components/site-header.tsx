import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { getAuth } from "@/lib/auth";
import { NAV_APP, NAV_PUBLIC } from "@/lib/site";
import { UserMenu } from "@/components/user-menu";
import { MobileNav } from "@/components/mobile-nav";
import { NavLinks } from "@/components/nav-links";
import { t } from "@/lib/i18n";

export async function SiteHeader() {
  const auth = await getAuth();

  // The safe-area insets sit on the <header>, not on the row inside it, so the
  // blurred black bar extends up under the status bar and out under the island
  // rather than leaving a transparent strip above itself.
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-black/70 backdrop-blur-xl pt-safe-top pl-safe-left pr-safe-right">
      <div className="shell flex h-14 items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <Logo />
          {/* Account lives in the user menu, so it isn't repeated here. */}
          <nav aria-label={t().nav.mainNav} className="hidden items-center gap-1 md:flex">
            <NavLinks
              items={[...(auth ? NAV_APP.filter((i) => i.href !== "/account") : []), ...NAV_PUBLIC]}
            />
          </nav>
        </div>

        <div className="flex items-center gap-2">
          {auth ? (
            <UserMenu
              email={auth.user.email}
              username={auth.user.username}
              isAdmin={auth.isAdmin}
            />
          ) : (
            <>
              {/* Below `sm` the menu carries Sign in, and the header row
                  doesn't have the width for both buttons and the toggle. */}
              <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
                <Link href="/login">{t().nav.signIn}</Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/signup">{t().nav.getPicks}</Link>
              </Button>
            </>
          )}
          <MobileNav isAuthed={Boolean(auth)} isAdmin={auth?.isAdmin ?? false} />
        </div>
      </div>
    </header>
  );
}
