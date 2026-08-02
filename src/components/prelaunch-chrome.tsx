import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { SITE } from "@/lib/site";

/**
 * Header and footer for everything reachable while the pre-launch gate is up.
 *
 * Deliberately not SiteHeader/SiteFooter: both are built around navigation to
 * the board, pricing and the account, and every one of those links redirects
 * home while the gate is up. Used by the signup and unsubscribe pages, and by
 * the public layout for the legal pages the gate lets through.
 */
export function PrelaunchChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col pl-safe-left pr-safe-right">
      <header className="pt-safe-top">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-4 sm:px-6">
          <Logo />
        </div>
      </header>

      <main id="main" className="flex-1">
        {children}
      </main>

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
            <a
              href="https://www.begambleaware.org"
              className="text-fg-muted hover:text-fg"
              rel="noopener noreferrer external"
              target="_blank"
            >
              BeGambleAware
            </a>
          </nav>

          <p className="mt-6 text-xs leading-relaxed text-fg-subtle">
            <strong className="text-fg-muted">18+ only.</strong> {SITE.name} sells
            information and opinion, not wagers. We do not take bets, hold funds, or act
            as a bookmaker. Every pick is a judgement call that can lose. Past
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
