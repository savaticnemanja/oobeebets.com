import Link from "next/link";
import { Feather } from "lucide-react";
import { Logo, Mark } from "@/components/brand/logo";
import { BottomNav, SidebarNav } from "@/components/app-shell/app-nav";
import { MobileTopBar, SidebarAccount, type ShellUser } from "@/components/app-shell/account-controls";
import { ScrollChrome } from "@/components/app-shell/scroll-chrome";
import { ComposeDialog } from "@/components/social/compose-dialog";
import { WhoToFollow } from "@/components/social/user-row";
import { getWhoToFollow } from "@/lib/social";
import { SITE } from "@/lib/site";
import { cn } from "@/lib/utils";
import { HelpLine } from "@/components/help-line";
import { UnreadProvider } from "@/components/app-shell/unread";
import { NavTracker } from "@/components/nav-memory";
import { ViewerProvider } from "@/components/app-shell/viewer";
import { unreadCount } from "@/lib/notifications";

/**
 * The signed-in layout, after X: a sticky sidebar on the left with the mark,
 * the navigation and the account button; the page in the middle. From `xl`
 * the sidebar shows labels, from `sm` it is icons only, and on a phone it
 * gives way to a top bar and a bottom tab bar.
 *
 * Widths: the sidebar is 275px from `xl` (72px as an icon rail below it), and
 * the content beside it is at most 1050px, so the whole layout tops out at
 * 1325px and centres. From `lg` that content is the page plus a 350px right
 * rail — Who to follow, then the small print — on every page, as on X. Below
 * `lg` there is no rail and the small print closes the page instead.
 */
export async function AppShell({
  user,
  children,
}: {
  user: ShellUser & { id: string };
  children: React.ReactNode;
}) {
  const [suggestions, unread] = await Promise.all([getWhoToFollow(user.id, 5), unreadCount(user.id)]);

  return (
    <ViewerProvider viewer={{ id: user.id, name: user.name, username: user.username }}>
    <UnreadProvider initial={unread}>
    <div className="mx-auto flex w-full max-w-[1325px] justify-center pl-safe-left pr-safe-right">
      <header className="sticky top-0 hidden h-dvh w-[4.5rem] shrink-0 flex-col items-center px-2 pb-3 pt-safe-top sm:flex xl:w-[275px] xl:items-stretch xl:px-3">
        <div className="flex h-16 items-center xl:px-3">
          <Link href="/home" aria-label="Home" className="grid size-12 place-items-center rounded-full transition-colors hover:bg-white/[0.07] xl:hidden">
            <Mark className="size-7 text-brand" />
          </Link>
          <Logo href="/home" className="hidden xl:inline-flex" />
        </div>

        <SidebarNav username={user.username} isAdmin={user.isAdmin} />

        {/* Opens the composer in a dialog, from any page, as X's does. */}
        <ComposeDialog viewerName={user.name}>
          <button
            type="button"
            aria-label="Post"
            className="mt-4 grid size-12 place-items-center rounded-full bg-brand text-[0.9375rem] font-semibold text-black transition-[background-color,box-shadow] duration-150 hover:bg-brand-bright hover:shadow-[0_0_28px_-6px_var(--color-brand-glow)] xl:flex xl:h-11 xl:w-full xl:items-center xl:justify-center"
          >
            <Feather className="size-5 xl:hidden" aria-hidden="true" />
            <span className="hidden xl:inline">Post</span>
          </button>
        </ComposeDialog>

        <div className="mt-auto w-full">
          <SidebarAccount user={user} />
        </div>
      </header>

      <div className="flex min-w-0 flex-1 gap-8 sm:max-w-[1050px]">
        {/* Bottom padding clears the phone's tab bar. */}
        <div className="flex min-h-dvh min-w-0 flex-1 flex-col pb-[calc(3.5rem+var(--spacing-safe-bottom))] sm:pb-0">
          <MobileTopBar user={user} />
          <main id="main" className="flex-1">
            {children}
          </main>
          {/* Not on a phone — there it lives at the foot of the drawer behind
              the avatar (account-controls.tsx); the rail carries it from lg. */}
          <LegalNote className="hidden sm:block lg:hidden" />
        </div>

        <aside aria-label="Sidebar" className="hidden w-[21.875rem] shrink-0 lg:block">
          <div className="sticky top-0 space-y-4 pt-3">
            <WhoToFollow users={suggestions} viewerId={user.id} />
            <LegalNote className="px-4 py-0" />
          </div>
        </aside>
      </div>

      {/* X's compose button floats above the tab bar on a phone, and drops
          with it when the bars slide away. It opens the composer full screen —
          Home has no inline composer on a phone; this is the way to post. */}
      <ComposeDialog viewerName={user.name}>
        <button
          type="button"
          aria-label="Post"
          className="fixed bottom-[calc(4.5rem+var(--spacing-safe-bottom))] right-4 z-40 grid size-14 translate-y-[calc(var(--chrome-p,0)*(3.5rem+1px+var(--spacing-safe-bottom)))] place-items-center rounded-full bg-brand text-black shadow-lg shadow-brand/20 transition-colors hover:bg-brand-bright sm:hidden"
        >
          <Feather className="size-6" aria-hidden="true" />
        </button>
      </ComposeDialog>
      <BottomNav username={user.username} isAdmin={user.isAdmin} />
      <ScrollChrome />
      <NavTracker />
    </div>
    </UnreadProvider>
    </ViewerProvider>
  );
}

/**
 * The footer's obligations in X's small print style: the 21+ line, the
 * helpline and the legal links stay on every signed-in page, not only the
 * marketing ones — under Who to follow in the rail, or at the end of the
 * page without one.
 */
function LegalNote({ className }: { className?: string }) {
  return (
    <footer className={cn("px-4 py-6 text-xs leading-relaxed text-fg-subtle", className)}>
      <p>
        <strong className="text-fg-muted">21+ only.</strong> {SITE.name} sells information and
        opinion, not wagers. Every pick can lose; never stake what you cannot afford to lose.{" "}
        <HelpLine />
      </p>
      <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        <Link href="/about" className="hover:underline">About</Link>
        <Link href="/legal/terms" className="hover:underline">Terms</Link>
        <Link href="/legal/privacy" className="hover:underline">Privacy</Link>
        <span>© {new Date().getFullYear()} {SITE.name}</span>
      </p>
    </footer>
  );
}
