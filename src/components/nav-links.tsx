"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * The header's desktop links. A client component only for `usePathname`, so
 * the current section reads as current — the header itself stays on the
 * server.
 */
export function NavLinks({ items }: { items: readonly { href: string; label: string }[] }) {
  const pathname = usePathname();

  return (
    <>
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors",
              active ? "bg-surface-2 text-fg" : "text-fg-muted hover:text-fg",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </>
  );
}
