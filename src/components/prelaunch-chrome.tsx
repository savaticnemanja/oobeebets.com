import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { SITE } from "@/lib/site";

/**
 * Header and footer for every page on the pre-launch site.
 *
 * Sticky footer, the ordinary way: the column is at least a viewport tall and
 * `main` takes the slack, so the footer sits on the bottom edge when a page is
 * short and gets pushed down normally when it is not. The margin above it is
 * counted in that slack, so it costs no scrollbar on a short page.
 *
 * This replaced a `fill` variant that pinned everything to `h-dvh` with
 * `overflow-hidden`. Locking the viewport meant long-form copy had to scroll
 * inside `main` instead of the page, which fights the scroll gesture people
 * expect and hides content behind a container edge at large text sizes. Letting
 * the page scroll is both simpler and better behaved; the footer staying put on
 * short pages was the only part worth keeping.
 */
export function PrelaunchChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col pl-safe-left pr-safe-right">
      <header className="shrink-0 pt-safe-top">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-4 sm:px-6">
          <Logo />
        </div>
      </header>

      <main id="main" className="flex-1">
        {children}
      </main>

      <footer className="mt-16 shrink-0 border-t border-border pb-safe-bottom">
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
