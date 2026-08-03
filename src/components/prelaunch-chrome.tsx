import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { SITE } from "@/lib/site";

/**
 * Header and footer for every page on the pre-launch site.
 *
 * Plain document flow: the page is exactly as tall as its content and scrolls
 * once it outgrows the viewport, which is all any of these pages need.
 *
 * This was a `min-h-dvh` column with `flex-1` on `main` — the ordinary sticky
 * footer — and on a tall phone it made the signup page measure exactly one
 * viewport: `main` swallowed the shortfall, the footer pinned itself to the
 * bottom edge, and the page did not scroll at all. The dead band it opened
 * between the form and the footer grew with the screen, 38px at 932 tall and
 * 104px at 998. A page that ends where its content ends reads as an ordinary
 * page at every size. The cost is background below the footer in a tall desktop
 * window, and that is invisible: the footer carries no fill of its own, so what
 * shows under it is the same black and the same aurora as above it.
 *
 * An earlier `fill` variant went further still and pinned everything to `h-dvh`
 * with `overflow-hidden`, which left long-form copy scrolling inside `main`
 * instead of the page. Nothing here should constrain the page to the viewport.
 */
export function PrelaunchChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="pl-safe-left pr-safe-right">
      <header className="pt-safe-top">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-4 sm:px-6">
          <Logo />
        </div>
      </header>

      <main id="main">{children}</main>

      <footer className="mt-16 border-t border-border pb-safe-bottom">
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
          <nav
            aria-label="Footer"
            className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm"
          >
            <Link href="/legal/privacy" className="text-fg-muted hover:text-fg">
              Privacy
            </Link>
            <Link href="/legal/terms" className="text-fg-muted hover:text-fg">
              Terms
            </Link>
            <Link href="/unsubscribe" className="text-fg-muted hover:text-fg">
              Unsubscribe
            </Link>
          </nav>

          <p className="mt-6 text-xs leading-relaxed text-fg-subtle">
            <strong className="text-fg-muted">18+ only.</strong> {SITE.name}{" "}
            sells information and opinion, not wagers. We do not take bets, hold funds,
            or act as a bookmaker. Every pick is a judgement call that can lose. Past
            performance does not predict future results. Never stake money you cannot
            afford to lose.
          </p>

          <p className="mt-4 text-xs text-fg-subtle">
            &copy; {new Date().getFullYear()} {SITE.name}. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
