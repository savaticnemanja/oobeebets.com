"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { LogOut, MoreHorizontal, User } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Avatar } from "@/components/social/identity";
import { Mark } from "@/components/brand/logo";
import { FEEDBACK_LABEL, FeedbackIcon, drawerItems } from "@/components/app-shell/app-nav";
import { FeedbackDialog } from "@/components/feedback-dialog";
import { logoutAction } from "@/app/actions/auth";
import { t } from "@/lib/i18n";
import { HelpLine } from "@/components/help-line";

export interface ShellUser {
  name: string;
  username: string;
  isAdmin: boolean;
}

/** Sign-out from inside a menu. See the note in UserMenu on why not a <form>. */
function useSignOut() {
  const [pending, start] = useTransition();
  return { pending, signOut: () => start(async () => { await logoutAction(); }) };
}

/** The account button at the foot of the sidebar: avatar, then name and handle from `xl`. */
export function SidebarAccount({ user }: { user: ShellUser }) {
  const { pending, signOut } = useSignOut();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t().nav.accountMenu}
        className="flex w-full items-center justify-center gap-3 rounded-full p-2 text-left transition-colors duration-150 hover:bg-white/[0.07] xl:justify-start xl:px-3 xl:py-2.5"
      >
        <Avatar name={user.name} />
        <span className="hidden min-w-0 flex-1 xl:block">
          <span className="block truncate text-sm font-semibold text-fg">{user.name}</span>
          <span className="block truncate text-sm text-fg-subtle">@{user.username}</span>
        </span>
        <MoreHorizontal className="hidden size-4 text-fg-muted xl:block" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="min-w-56">
        <DropdownMenuItem asChild>
          <Link href={`/u/${user.username}`}>
            <User aria-hidden="true" />
            {t().nav.profile}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={pending} onSelect={signOut}>
          <LogOut aria-hidden="true" />
          {t().nav.signOut} @{user.username}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The phone's top bar: avatar on the left opens a drawer with everything the
 * bottom bar has no room for; the mark sits in the middle, as on X.
 */
export function MobileTopBar({ user }: { user: ShellUser }) {
  const [open, setOpen] = useState(false);
  // Outside the drawer, so the drawer can close before it opens.
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const { pending, signOut } = useSignOut();

  return (
    <>
      <header
        data-chrome-top
        // Slid up by ScrollChrome as you scroll down; see scroll-chrome.tsx.
        className="sticky top-0 z-40 translate-y-[calc(var(--chrome-hide,0px)*-1)] border-b border-border bg-black/80 pt-safe-top backdrop-blur-xl sm:hidden"
      >
        <div className="relative flex h-14 items-center px-4">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger aria-label={t().nav.openMenu} className="rounded-full">
              <Avatar name={user.name} size="sm" className="size-8" />
            </DialogTrigger>
            {/* A sheet from the left edge rather than the centred card. */}
            <DialogContent className="left-0 top-0 h-dvh max-h-dvh w-[80vw] max-w-xs translate-x-0 translate-y-0 rounded-none border-y-0 border-l-0 pt-[calc(1.5rem+var(--spacing-safe-top))]">
              <DialogTitle className="sr-only">Navigation</DialogTitle>
              <Avatar name={user.name} />
              <p className="mt-3 truncate font-semibold text-fg">{user.name}</p>
              <p className="truncate text-sm text-fg-subtle">@{user.username}</p>
              <nav aria-label={t().nav.mobileNav} className="mt-6 flex flex-col">
                {drawerItems(user.username, user.isAdmin).map(({ href, label, icon: Icon }) => (
                  <DialogClose asChild key={href}>
                    <Link href={href} className="flex items-center gap-4 py-3 text-lg font-semibold text-fg transition-colors hover:text-brand">
                      <Icon className="size-5" aria-hidden="true" />
                      {label}
                    </Link>
                  </DialogClose>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setFeedbackOpen(true);
                  }}
                  className="flex items-center gap-4 py-3 text-left text-lg font-semibold text-fg transition-colors hover:text-brand"
                >
                  <FeedbackIcon className="size-5" aria-hidden="true" />
                  {FEEDBACK_LABEL}
                </button>
              </nav>
              <button
                type="button"
                disabled={pending}
                onClick={signOut}
                className="mt-4 flex w-full items-center gap-4 border-t border-border pt-4 text-base text-fg-muted transition-colors hover:text-fg"
              >
                <LogOut className="size-5" aria-hidden="true" />
                {t().nav.signOut}
              </button>
              {/* The small print, which the page itself doesn't carry on a phone. */}
              <div className="mt-6 text-xs leading-relaxed text-fg-subtle">
                <p>
                  <strong className="text-fg-muted">21+ only.</strong> Every pick can lose; never stake
                  what you cannot afford to lose. <HelpLine />
                </p>
                <p className="mt-2 flex gap-3">
                  <DialogClose asChild>
                    <Link href="/legal/terms" className="hover:underline">Terms</Link>
                  </DialogClose>
                  <DialogClose asChild>
                    <Link href="/legal/privacy" className="hover:underline">Privacy</Link>
                  </DialogClose>
                </p>
              </div>
            </DialogContent>
          </Dialog>

          <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />

          <Link href="/home" aria-label="Home" className="absolute left-1/2 -translate-x-1/2">
            <Mark className="text-brand" />
          </Link>
        </div>
      </header>
      {/* A solid band behind the status bar, which doesn't move. The page runs
          under the notch (viewport-fit: cover), so without it a collapsed top
          bar left its own bottom edge there — translucent, blurring whatever
          scrolled behind it. Now the bar slides away under this instead. */}
      <div
        aria-hidden="true"
        className="fixed inset-x-0 top-0 z-40 h-[var(--spacing-safe-top)] bg-black sm:hidden"
      />
    </>
  );
}
