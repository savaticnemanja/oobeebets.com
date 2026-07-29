"use client";

import Link from "next/link";
import { useTransition } from "react";
import { LogOut, Settings, Shield, User as UserIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { logoutAction } from "@/app/actions/auth";
import type { Tier } from "@/db/schema";
import { t } from "@/lib/i18n";

export function UserMenu({
  email,
  isAdmin,
  tier,
}: {
  email: string;
  isAdmin: boolean;
  tier: Tier | null;
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
          <span>
            {tier ? (
              <Badge variant="brand">{tier}</Badge>
            ) : (
              <Badge variant="outline">{t().account.noPlan}</Badge>
            )}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/picks">
            <UserIcon aria-hidden="true" />
            {t().account.todaysPicks}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/account">
            <Settings aria-hidden="true" />
            {t().account.billing}
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
