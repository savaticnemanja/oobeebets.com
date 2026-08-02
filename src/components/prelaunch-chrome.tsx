import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { SITE } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * Header and footer for everything reachable while the pre-launch gate is up.
 *
 * Deliberately not SiteHeader/SiteFooter: both are built around navigation to
 * the board, pricing and the account, and every one of those links redirects
 * home while the gate is up. Used by the signup and unsubscribe pages, and by
 * the public layout for the legal pages the gate lets through.
 *
 * `fill` pins the whole thing to one viewport with no page scroll, for the two
 * short pages behind the gate. The legal pages render through here too and run
 * well past a screen, so it stays off by default.
 */
export function PrelaunchChrome({
  children,
  fill = false,
}: {
  children: React.ReactNode;
  fill?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col pl-safe-left pr-safe-right",
        fill ? "h-dvh overflow-hidden" : "min-h-dvh",
      )}
    >
      <header className="shrink-0 pt-safe-top">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-4 sm:px-6">
          <Logo />
        </div>
      </header>

      {/* When filled, `min-h-0` is what lets this shrink inside the flex column
          instead of shunting the footer off-screen, and the overflow sits here
          rather than on the page: a short viewport or a 200% text zoom has to
          scroll something, and scrolling the content beats clipping it. */}
      <main
        id="main"
        className={cn(
          "flex-1",
          fill && "flex min-h-0 flex-col justify-center overflow-y-auto",
        )}
      >
        {children}
      </main>

      <footer
        className={cn("shrink-0 border-t border-border pb-safe-bottom", !fill && "mt-16")}
      >
        <div
          className={cn("mx-auto max-w-3xl px-4 sm:px-6", fill ? "py-4 sm:py-5" : "py-8")}
        >
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

          {/* Same disclaimers either way — they are the ones that matter for a
              tipping site — just tightened to a line when the page has to fit a
              screen. */}
          {fill ? (
            <p className="mt-4 text-xs leading-relaxed text-fg-subtle">
              <strong className="text-fg-muted">18+ only.</strong> {SITE.name}{" "}
              sells information and opinion, not wagers &mdash; we never take bets or
              hold funds. Every pick can lose, and past performance does not predict
              future results. &copy; {new Date().getFullYear()} {SITE.name}.
            </p>
          ) : (
            <>
              <p className="mt-6 text-xs leading-relaxed text-fg-subtle">
                <strong className="text-fg-muted">18+ only.</strong> {SITE.name}{" "}
                sells information and opinion, not wagers. We do not take bets, hold
                funds, or act as a bookmaker. Every pick is a judgement call that can
                lose. Past
                performance does not predict future results. Never stake money you
                cannot afford to lose.
              </p>

              <p className="mt-4 text-xs text-fg-subtle">
                &copy; {new Date().getFullYear()} {SITE.name}. All rights reserved.
              </p>
            </>
          )}
        </div>
      </footer>
    </div>
  );
}
