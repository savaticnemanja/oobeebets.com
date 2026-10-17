"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  ArrowUpRight,
  CalendarCheck,
  CircleCheckBig,
  Flag,
  History,
  Hourglass,
  Layers,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  MessageSquareText,
  TicketCheck,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { Mark } from "@/components/brand/logo";
import { Avatar } from "@/components/social/identity";
import { logoutAction } from "@/app/actions/auth";
import { cn } from "@/lib/utils";

/**
 * The admin console's frame: a dashboard with the sections down a sidebar on
 * the left, grouped by the job they do, and the page beside it. Below `lg` the
 * sidebar becomes a drawer behind a menu button in a top bar.
 *
 * Counts come from the layout (one cheap query each), so a section with work
 * waiting says so from anywhere in the console. `attention` counts are the
 * ones that block something — a result testers are waiting on, a report — and
 * are drawn louder than the merely informative ones.
 */

export type AdminBadges = Partial<Record<BadgeKey, number>>;
type BadgeKey = "settle" | "reports" | "feedback" | "waitlist";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: BadgeKey;
  /** Loud when non-zero: something is blocked until an admin acts. */
  attention?: boolean;
}

const NAV: { label?: string; items: NavItem[] }[] = [
  {
    items: [
      { href: "/admin", label: "Overview", icon: LayoutDashboard },
      { href: "/admin/activity", label: "Activity", icon: History },
    ],
  },
  {
    label: "Board",
    items: [
      { href: "/admin/slate", label: "Publish slate", icon: CalendarCheck },
      { href: "/admin/settle", label: "Settle", icon: CircleCheckBig, badge: "settle", attention: true },
    ],
  },
  {
    label: "People",
    items: [
      { href: "/admin/users", label: "Users", icon: Users },
      { href: "/admin/waitlist", label: "Waitlist", icon: Hourglass, badge: "waitlist" },
    ],
  },
  {
    label: "Insights",
    items: [
      { href: "/admin/follows", label: "Follows", icon: TicketCheck },
      { href: "/admin/parlays", label: "Parlays", icon: Layers },
    ],
  },
  {
    label: "Inbox",
    items: [
      { href: "/admin/reports", label: "Reports", icon: Flag, badge: "reports", attention: true },
      { href: "/admin/feedback", label: "Feedback", icon: MessageSquareText, badge: "feedback" },
      { href: "/admin/announce", label: "Announce", icon: Megaphone },
    ],
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export interface AdminViewer {
  name: string;
  email: string;
  avatarId: string | null;
}

export function AdminShell({
  viewer,
  badges,
  children,
}: {
  viewer: AdminViewer;
  badges: AdminBadges;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const current = NAV.flatMap((g) => g.items).find((i) => isActive(pathname, i.href));
  const waiting = (badges.settle ?? 0) + (badges.reports ?? 0);

  return (
    <div className="flex min-h-dvh pl-safe-left pr-safe-right">
      {/* ------------------------------------------------ sidebar, from lg */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-surface pt-safe-top lg:flex">
        <SidebarBody pathname={pathname} badges={badges} viewer={viewer} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* ------------------------------------------- top bar, below lg */}
        <header className="sticky top-0 z-40 border-b border-border bg-black/85 pt-safe-top backdrop-blur-xl lg:hidden">
          <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
            <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
              <DialogPrimitive.Trigger asChild>
                <button
                  type="button"
                  aria-label={waiting > 0 ? `Open admin menu, ${waiting} waiting` : "Open admin menu"}
                  className="relative -ml-2 grid size-10 place-items-center rounded-full text-fg-muted transition-colors hover:bg-white/[0.07] hover:text-fg"
                >
                  <Menu className="size-5" aria-hidden="true" />
                  {waiting > 0 && (
                    <span aria-hidden="true" className="absolute right-1.5 top-1.5 size-2 rounded-full bg-brand ring-2 ring-black" />
                  )}
                </button>
              </DialogPrimitive.Trigger>
              <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" />
                <DialogPrimitive.Content
                  className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-border bg-surface pt-safe-top pb-safe-bottom shadow-2xl outline-none"
                  aria-describedby={undefined}
                >
                  <DialogPrimitive.Title className="sr-only">Admin menu</DialogPrimitive.Title>
                  <DialogPrimitive.Close
                    className="absolute right-3 top-[calc(0.75rem+var(--spacing-safe-top))] grid size-9 place-items-center rounded-full text-fg-subtle transition-colors hover:bg-white/[0.07] hover:text-fg"
                    aria-label="Close admin menu"
                  >
                    <X className="size-4" aria-hidden="true" />
                  </DialogPrimitive.Close>
                  <SidebarBody pathname={pathname} badges={badges} viewer={viewer} onNavigate={() => setOpen(false)} />
                </DialogPrimitive.Content>
              </DialogPrimitive.Portal>
            </DialogPrimitive.Root>

            <Link href="/admin" aria-label="Admin overview" className="shrink-0">
              <Mark className="size-6 text-brand" />
            </Link>
            <span className="truncate text-sm font-medium text-fg">{current?.label ?? "Admin"}</span>
          </div>
        </header>

        <main id="main" className="min-w-0 flex-1 px-4 pb-16 pt-6 sm:px-6 lg:px-10 lg:pt-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

function SidebarBody({
  pathname,
  badges,
  viewer,
  onNavigate,
}: {
  pathname: string;
  badges: AdminBadges;
  viewer: AdminViewer;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div className="flex h-16 shrink-0 items-center gap-2.5 px-5">
        <Link href="/admin" onClick={onNavigate} className="group inline-flex items-center gap-2.5 rounded-md text-fg">
          <Mark className="text-brand transition-transform duration-500 group-hover:rotate-180 motion-reduce:transition-none" />
          <span className="text-sm font-semibold tracking-[0.18em] lowercase">
            oobee<span className="text-brand">·</span>bets
          </span>
        </Link>
        <span className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-[0.625rem] font-medium uppercase tracking-wider text-fg-muted">
          Admin
        </span>
      </div>

      <nav aria-label="Admin sections" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4">
        {NAV.map((group, gi) => (
          <div key={group.label ?? gi} className={cn(gi > 0 && "mt-5")}>
            {group.label && (
              <p className="px-3 pb-1.5 text-[0.6875rem] font-medium uppercase tracking-wider text-fg-subtle">
                {group.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(pathname, item.href);
                const count = item.badge ? (badges[item.badge] ?? 0) : 0;
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      aria-label={count > 0 ? `${item.label}, ${count}` : undefined}
                      className={cn(
                        "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                        active
                          ? "bg-white/[0.07] font-medium text-fg"
                          : "text-fg-muted hover:bg-white/[0.04] hover:text-fg",
                      )}
                    >
                      <Icon
                        className={cn("size-[1.125rem] shrink-0", active ? "text-brand" : "text-fg-subtle group-hover:text-fg-muted")}
                        strokeWidth={active ? 2.25 : 1.75}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {count > 0 && (
                        <span
                          aria-hidden="true"
                          className={cn(
                            "num grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[0.6875rem] font-semibold",
                            item.attention ? "bg-brand text-black" : "bg-surface-3 text-fg-muted",
                          )}
                        >
                          {count > 99 ? "99+" : count}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-border p-3">
        <Link
          href="/home"
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-fg-muted transition-colors hover:bg-white/[0.04] hover:text-fg"
        >
          <ArrowUpRight className="size-[1.125rem] shrink-0 text-fg-subtle" aria-hidden="true" />
          Back to the site
        </Link>
        <div className="mt-2 flex items-center gap-2.5 rounded-lg px-3 py-2">
          <Avatar name={viewer.name} avatarId={viewer.avatarId} size="sm" />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-medium text-fg">{viewer.name}</p>
            <p className="truncate text-xs text-fg-subtle">{viewer.email}</p>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              aria-label="Sign out"
              title="Sign out"
              className="grid size-8 place-items-center rounded-full text-fg-subtle transition-colors hover:bg-white/[0.07] hover:text-fg"
            >
              <LogOut className="size-4" aria-hidden="true" />
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
