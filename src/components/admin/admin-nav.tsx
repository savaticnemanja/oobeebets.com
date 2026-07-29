"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function AdminNav({
  items,
  isOwner,
}: {
  items: readonly { href: string; label: string }[];
  isOwner: boolean;
}) {
  const pathname = usePathname();

  return (
    // `overflow-x: auto` forces overflow-y from `visible` to `auto`, so the one
    // pixel the active underline hangs below this box (it is positioned to
    // overlap the header's border) made the strip vertically scrollable and
    // painted a scrollbar. The padding swallows that pixel; the negative margin
    // takes it back off the header, so the underline still lands on the border.
    <nav
      aria-label="Admin sections"
      className="mx-auto -mb-px max-w-7xl overflow-x-auto px-4 pb-px sm:px-6"
    >
      <ul className="flex items-center gap-1">
        {items.map((item) => {
          // Users management is owner-only; hiding it keeps the UI honest about
          // what the action layer will actually allow.
          if (item.href === "/admin/users" && !isOwner) return null;
          const active =
            item.href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(item.href);

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative inline-flex whitespace-nowrap px-3 py-2.5 text-sm transition-colors",
                  active ? "text-brand" : "text-fg-muted hover:text-fg",
                )}
              >
                {item.label}
                {active && (
                  <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-brand" />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
