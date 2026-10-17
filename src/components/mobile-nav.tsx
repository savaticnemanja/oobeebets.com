"use client";

import * as React from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { NAV_APP, NAV_PUBLIC } from "@/lib/site";
import { t } from "@/lib/i18n";

export function MobileNav({
  isAuthed,
  isAdmin,
}: {
  isAuthed: boolean;
  isAdmin: boolean;
}) {
  const [open, setOpen] = React.useState(false);

  const links = [
    ...(isAuthed ? NAV_APP : ([{ href: "/login", label: t().nav.signIn }] as const)),
    ...NAV_PUBLIC,
    ...(isAdmin ? ([{ href: "/admin", label: t().nav.admin }] as const) : []),
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        aria-label={t().nav.openMenu}
        className="inline-flex size-9 items-center justify-center rounded-lg border border-border text-fg-muted transition-colors hover:text-fg md:hidden"
      >
        <Menu className="size-4" aria-hidden="true" />
      </DialogTrigger>
      {/* Drops from y=0, so it clears the header (3.5rem) *and* the status bar
          it is now sitting under. */}
      <DialogContent className="top-0 max-w-full translate-y-0 rounded-b-2xl rounded-t-none pt-[calc(3.5rem+var(--spacing-safe-top))]">
        <DialogTitle className="sr-only">Navigation</DialogTitle>
        <nav aria-label={t().nav.mobileNav} className="flex flex-col">
          {links.map((l) => (
            <DialogClose asChild key={l.href}>
              <Link
                href={l.href}
                className="border-b border-border py-3 text-base text-fg transition-colors last:border-0 hover:text-brand"
              >
                {l.label}
              </Link>
            </DialogClose>
          ))}
        </nav>
      </DialogContent>
    </Dialog>
  );
}
