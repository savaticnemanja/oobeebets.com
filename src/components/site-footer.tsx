import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { SITE } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-border">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-8 md:flex-row md:justify-between">
          <div className="max-w-xs">
            <Logo />
            <p className="mt-3 text-sm text-fg-muted">{SITE.tagline}</p>
          </div>

          <nav aria-label="Footer" className="grid grid-cols-2 gap-8 text-sm sm:grid-cols-3">
            <div>
              <h2 className="text-[0.6875rem] font-medium uppercase tracking-wider text-fg-subtle">
                Product
              </h2>
              <ul className="mt-3 space-y-2">
                <li><Link href="/picks" className="text-fg-muted hover:text-fg">Picks</Link></li>
              </ul>
            </div>
            <div>
              <h2 className="text-[0.6875rem] font-medium uppercase tracking-wider text-fg-subtle">
                Company
              </h2>
              <ul className="mt-3 space-y-2">
                <li><Link href="/about" className="text-fg-muted hover:text-fg">About us</Link></li>
                <li><Link href="/legal/terms" className="text-fg-muted hover:text-fg">Terms</Link></li>
                <li><Link href="/legal/privacy" className="text-fg-muted hover:text-fg">Privacy</Link></li>
              </ul>
            </div>
            <div>
              <h2 className="text-[0.6875rem] font-medium uppercase tracking-wider text-fg-subtle">
                Play safe
              </h2>
              <ul className="mt-3 space-y-2">
                <li>
                  <a
                    href="https://www.begambleaware.org"
                    className="text-fg-muted hover:text-fg"
                    rel="noopener noreferrer external"
                    target="_blank"
                  >
                    BeGambleAware
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.ncpgambling.org/help-treatment/"
                    className="text-fg-muted hover:text-fg"
                    rel="noopener noreferrer external"
                    target="_blank"
                  >
                    Get help
                  </a>
                </li>
              </ul>
            </div>
          </nav>
        </div>

        {/* Compliance copy. Required, and it is also the honest framing of what
            is being sold: information, not outcomes. */}
        <div className="mt-10 border-t border-border pt-6">
          <p className="text-xs leading-relaxed text-fg-subtle">
            {/* The explicit {" "} is load-bearing: JSX drops the leading space of
                a multi-line text node, which glues the brand name to the next word. */}
            <strong className="text-fg-muted">18+ only.</strong> {SITE.name}{" "}
            sells information and opinion, not wagers. We do not take bets, hold funds,
            or
            act as a bookmaker. Every pick is a judgement call that can lose. Past
            performance does not predict future results, and no outcome is guaranteed.
            Never stake money you cannot afford to lose. If gambling stops being fun,
            stop &mdash; and use the help links above.
          </p>
          <div className="mt-4 flex flex-col gap-2 text-xs text-fg-subtle sm:flex-row sm:items-center sm:justify-between">
            <p>
              &copy; {new Date().getFullYear()} {SITE.name}. All rights reserved.
            </p>
            <p>
              Developed by{" "}
              <a
                href="https://nemanjas.dev"
                className="text-fg-muted hover:text-fg"
                rel="noopener noreferrer external"
                target="_blank"
              >
                nemanjas.dev
              </a>
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
