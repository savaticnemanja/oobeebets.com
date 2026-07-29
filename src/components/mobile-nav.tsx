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
import { NAV_PUBLIC } from "@/lib/site";

export function MobileNav({
  isAuthed,
  isAdmin,
}: {
  isAuthed: boolean;
  isAdmin: boolean;
}) {
  const [open, setOpen] = React.useState(false);

  const links = [
    ...NAV_PUBLIC,
    ...(isAuthed
      ? ([
          { href: "/picks", label: "Picks" },
          { href: "/account", label: "Account" },
        ] as const)
      : ([{ href: "/login", label: "Sign in" }] as const)),
    ...(isAdmin ? ([{ href: "/admin", label: "Admin" }] as const) : []),
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        aria-label="Open menu"
        className="inline-flex size-9 items-center justify-center rounded-lg border border-border text-fg-muted transition-colors hover:text-fg md:hidden"
      >
        <Menu className="size-4" aria-hidden="true" />
      </DialogTrigger>
      <DialogContent className="top-0 max-w-full translate-y-0 rounded-b-2xl rounded-t-none pt-14">
        <DialogTitle className="sr-only">Navigation</DialogTitle>
        <nav aria-label="Mobile" className="flex flex-col">
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
