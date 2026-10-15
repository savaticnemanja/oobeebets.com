import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * An either/or choice — Regular season | Playoffs, Qualified | All — as one
 * segmented control rather than loose pills, so it reads as one setting with
 * one answer. The same look as the Stats tab's Overview | Picks | Parlays.
 * Every option is a link the server built.
 */
export function Segmented({
  label,
  options,
  className,
}: {
  /** Names the control for screen readers. */
  label: string;
  options: Array<{ key: string; href: string; on: boolean; label: React.ReactNode }>;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cn("flex shrink-0 rounded-full bg-surface-2 p-0.5", className)}>
      {options.map((o) => (
        <Link
          key={o.key}
          href={o.href}
          scroll={false}
          aria-current={o.on ? "page" : undefined}
          className={cn(
            "rounded-full px-3 py-1 text-sm font-medium transition-colors",
            o.on ? "bg-fg text-black" : "text-fg-muted hover:text-fg",
          )}
        >
          {o.label}
        </Link>
      ))}
    </nav>
  );
}
