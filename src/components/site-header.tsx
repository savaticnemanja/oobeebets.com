import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { getAuth } from "@/lib/auth";
import { NAV_PUBLIC } from "@/lib/site";
import { UserMenu } from "@/components/user-menu";
import { MobileNav } from "@/components/mobile-nav";

export async function SiteHeader() {
  const auth = await getAuth();

  // The safe-area insets sit on the <header>, not on the row inside it, so the
  // blurred black bar extends up under the status bar and out under the island
  // rather than leaving a transparent strip above itself.
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-black/70 backdrop-blur-xl pt-safe-top pl-safe-left pr-safe-right">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-8">
          <Logo />
          <nav aria-label="Main" className="hidden items-center gap-6 md:flex">
            {NAV_PUBLIC.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-sm text-fg-muted transition-colors hover:text-fg"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          {auth ? (
            <>
              <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
                <Link href="/picks">Picks</Link>
              </Button>
              <UserMenu
                email={auth.user.email}
                isAdmin={auth.isAdmin}
                tier={auth.tier}
              />
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/login">Sign in</Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/pricing">Get picks</Link>
              </Button>
            </>
          )}
          <MobileNav isAuthed={Boolean(auth)} isAdmin={auth?.isAdmin ?? false} />
        </div>
      </div>
    </header>
  );
}
