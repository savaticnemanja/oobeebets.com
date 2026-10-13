"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, Info, Shield, Target, Ticket, User, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/**
 * The signed-in navigation, as on X: every destination is an icon plus a
 * label. The current one is semibold with a heavier, brand-coloured icon; the
 * rest are muted and brighten on hover over a soft pill.
 *
 * The sidebar carries everything. The phone's bottom bar has room for the
 * four places people actually go back and forth between; the rest (About,
 * Admin) sit in the drawer behind the avatar in the top bar. Account settings
 * aren't a destination of their own: they're "Edit profile", on your profile.
 */
function items(username: string, isAdmin: boolean): { sidebar: NavItem[]; bottom: NavItem[] } {
  const home = { href: "/home", label: t().nav.home, icon: House };
  const picks = { href: "/picks", label: t().nav.picks, icon: Target };
  const myBets = { href: "/my-bets", label: t().nav.myBets, icon: Ticket };
  const profile = { href: `/u/${username}`, label: t().nav.profile, icon: User };
  return {
    sidebar: [
      home,
      picks,
      myBets,
      profile,
      { href: "/about", label: t().nav.about, icon: Info },
      ...(isAdmin ? [{ href: "/admin", label: t().nav.admin, icon: Shield }] : []),
    ],
    bottom: [home, picks, myBets, profile],
  };
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Icon-only from `sm`, icon and label from `xl` — X's own breakpoints. */
export function SidebarNav({ username, isAdmin }: { username: string; isAdmin: boolean }) {
  const pathname = usePathname();
  return (
    <nav aria-label={t().nav.mainNav} className="flex flex-col items-center gap-1 xl:items-stretch">
      {items(username, isAdmin).sidebar.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            title={label}
            className="group flex rounded-full outline-none"
          >
            <span
              className={cn(
                "inline-flex items-center gap-4 rounded-full px-3 py-2.5 text-[1.0625rem] leading-6 transition-colors duration-150",
                "group-hover:bg-white/[0.07] group-active:bg-white/[0.11] group-focus-visible:ring-2 group-focus-visible:ring-brand/60 xl:pr-5",
                active ? "font-semibold text-fg" : "text-fg-muted group-hover:text-fg",
              )}
            >
              <Icon
                className={cn(
                  "size-6 shrink-0 transition-transform duration-150 group-hover:scale-105",
                  active && "text-brand",
                )}
                strokeWidth={active ? 2.25 : 1.75}
                aria-hidden="true"
              />
              <span className="hidden xl:inline">{label}</span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

/** The phone's tab bar. Labels are kept for screen readers only, as on X. */
export function BottomNav({ username, isAdmin }: { username: string; isAdmin: boolean }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label={t().nav.mobileNav}
      // Slides down as the top bar slides up (scroll-chrome.tsx).
      className="fixed inset-x-0 bottom-0 z-40 translate-y-[calc(var(--chrome-p,0)*100%)] border-t border-border bg-black/85 pb-safe-bottom backdrop-blur-xl sm:hidden"
    >
      <ul className="flex h-14 items-stretch justify-around">
        {items(username, isAdmin).bottom.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href} className="flex flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-1 items-center justify-center transition-colors active:bg-white/[0.07]",
                  active ? "text-brand" : "text-fg-muted",
                )}
              >
                <Icon className="size-6" strokeWidth={active ? 2.25 : 1.75} aria-hidden="true" />
                <span className="sr-only">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** The drawer's links on a phone: what the bottom bar has no room for. */
export function drawerItems(username: string, isAdmin: boolean): NavItem[] {
  const { sidebar, bottom } = items(username, isAdmin);
  const inBar = new Set(bottom.map((i) => i.href));
  return [
    sidebar.find((i) => i.href === `/u/${username}`)!,
    ...sidebar.filter((i) => !inBar.has(i.href)),
  ];
}
