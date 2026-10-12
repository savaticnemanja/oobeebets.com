import Link from "next/link";
import { Feather } from "lucide-react";
import { Logo, Mark } from "@/components/brand/logo";
import { BottomNav, SidebarNav } from "@/components/app-shell/app-nav";
import { MobileTopBar, SidebarAccount, type ShellUser } from "@/components/app-shell/account-controls";
import { SITE } from "@/lib/site";

/**
 * The signed-in layout, after X: a sticky sidebar on the left with the mark,
 * the navigation and the account button; the page in the middle. From `xl`
 * the sidebar shows labels, from `sm` it is icons only, and on a phone it
 * gives way to a top bar and a bottom tab bar.
 *
 * Pages decide their own middle: feeds use SocialShell (600px column plus the
 * right rail), boards and settings take the width they need.
 */
export function AppShell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-[80rem] justify-center pl-safe-left pr-safe-right">
      <header className="sticky top-0 hidden h-dvh w-[4.5rem] shrink-0 flex-col items-center px-2 pb-3 pt-safe-top sm:flex xl:w-[17rem] xl:items-stretch xl:px-3">
        <div className="flex h-16 items-center xl:px-3">
          <Link href="/home" aria-label="Home" className="grid size-12 place-items-center rounded-full transition-colors hover:bg-white/[0.07] xl:hidden">
            <Mark className="size-7 text-brand" />
          </Link>
          <Logo href="/home" className="hidden xl:inline-flex" />
        </div>

        <SidebarNav username={user.username} isAdmin={user.isAdmin} />

        <Link
          href="/home#compose"
          aria-label="Post"
          className="mt-4 grid size-12 place-items-center rounded-full bg-brand text-[0.9375rem] font-semibold text-black transition-[background-color,box-shadow] duration-150 hover:bg-brand-bright hover:shadow-[0_0_28px_-6px_var(--color-brand-glow)] xl:flex xl:h-11 xl:w-full xl:items-center xl:justify-center"
        >
          <Feather className="size-5 xl:hidden" aria-hidden="true" />
          <span className="hidden xl:inline">Post</span>
        </Link>

        <div className="mt-auto w-full">
          <SidebarAccount user={user} />
        </div>
      </header>

      {/* Bottom padding clears the phone's tab bar. */}
      <div className="flex min-h-dvh min-w-0 flex-1 flex-col pb-[calc(3.5rem+var(--spacing-safe-bottom))] sm:max-w-[62rem] sm:pb-0">
        <MobileTopBar user={user} />
        <main id="main" className="flex-1">
          {children}
        </main>
        <LegalNote />
      </div>

      {/* X's compose button floats above the tab bar on a phone. */}
      <Link
        href="/home#compose"
        aria-label="Post"
        className="fixed bottom-[calc(4.5rem+var(--spacing-safe-bottom))] right-4 z-40 grid size-14 place-items-center rounded-full bg-brand text-black shadow-lg shadow-brand/20 transition-colors hover:bg-brand-bright sm:hidden"
      >
        <Feather className="size-6" aria-hidden="true" />
      </Link>
      <BottomNav username={user.username} isAdmin={user.isAdmin} />
    </div>
  );
}

/**
 * The footer's obligations in X's small print style: the 18+ line and the
 * help links stay on every signed-in page, not only the marketing ones.
 */
function LegalNote() {
  return (
    <footer className="px-4 py-6 text-xs leading-relaxed text-fg-subtle">
      <p>
        <strong className="text-fg-muted">18+ only.</strong> {SITE.name} sells information and
        opinion, not wagers. Every pick can lose; never stake what you cannot afford to lose.
      </p>
      <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        <Link href="/about" className="hover:underline">About</Link>
        <Link href="/legal/terms" className="hover:underline">Terms</Link>
        <Link href="/legal/privacy" className="hover:underline">Privacy</Link>
        <a href="https://www.begambleaware.org" target="_blank" rel="noopener noreferrer" className="hover:underline">BeGambleAware</a>
        <a href="https://www.ncpgambling.org/help-treatment/" target="_blank" rel="noopener noreferrer" className="hover:underline">Get help</a>
        <span>© {new Date().getFullYear()} {SITE.name}</span>
      </p>
    </footer>
  );
}
