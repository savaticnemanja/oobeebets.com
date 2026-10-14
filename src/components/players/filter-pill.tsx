import Link from "next/link";
import { cn } from "@/lib/utils";

/** A filter as a pill link — the same pill as the Stats page's "Show" row. */
export function FilterPill({ href, on, children }: { href: string; on: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={on ? "page" : undefined}
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
        on ? "border-fg bg-fg text-black" : "border-border text-fg-muted hover:border-border-strong hover:text-fg",
      )}
    >
      {children}
    </Link>
  );
}
