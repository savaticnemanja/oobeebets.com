"use client";

import Link from "next/link";
import { useTransition } from "react";
import { CircleUser, House, LogOut, Settings, Shield, Sparkles, User as UserIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logoutAction } from "@/app/actions/auth";
import { t } from "@/lib/i18n";

export function UserMenu({
  email,
  username,
  isAdmin,
}: {
  email: string;
  username: string;
  isAdmin: boolean;
}) {
  const initial = email.charAt(0).toUpperCase();
  const [signingOut, startSignOut] = useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t().nav.accountMenu}
        className="flex size-9 items-center justify-center rounded-full border border-border bg-surface-2 text-sm font-semibold text-brand transition-colors hover:border-brand/40"
      >
        {initial}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="flex flex-col gap-1">
          <span className="truncate text-sm text-fg">{email}</span>
          <span className="truncate text-xs text-fg-subtle">@{username}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={`/u/${username}`}>
            <CircleUser aria-hidden="true" />
            {t().nav.profile}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/home">
            <House aria-hidden="true" />
            {t().nav.home}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/picks">
            <UserIcon aria-hidden="true" />
            {t().account.todaysPicks}
          </Link>
        </DropdownMenuItem>
        {/* The header's own nav only carries links a signed-out visitor can
            open, so this menu is where a tester reaches /top-picks. */}
        <DropdownMenuItem asChild>
          <Link href="/top-picks">
            <Sparkles aria-hidden="true" />
            {t().nav.topPicks}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/account">
            <Settings aria-hidden="true" />
            {t().account.account}
          </Link>
        </DropdownMenuItem>
        {isAdmin && (
          <DropdownMenuItem asChild>
            <Link href="/admin">
              <Shield aria-hidden="true" />
              {t().account.adminPanel}
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        {/* Called through onSelect rather than wrapped in a <form>. A form here
            never submits: selecting a menu item closes the menu, React flushes
            that unmount synchronously while still inside the click event, and
            the browser will not submit a form that has left the document by the
            time it runs the button's default action. Keyboard select was worse
            still — Radix activates an item with `currentTarget.click()`, which
            on a <form> does nothing at all. */}
        <DropdownMenuItem
          disabled={signingOut}
          onSelect={() => startSignOut(async () => { await logoutAction(); })}
        >
          <LogOut aria-hidden="true" />
          {t().nav.signOut}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
