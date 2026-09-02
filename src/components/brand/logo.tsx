import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function Mark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("size-6 shrink-0", className)}
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2.75" />
    </svg>
  );
}

export function Logo({
  className,
  href = "/",
}: {
  className?: string;
  href?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex items-center gap-2.5 rounded-md text-fg transition-opacity hover:opacity-90",
        className,
      )}
    >
      <Mark className="text-brand transition-transform duration-500 group-hover:rotate-180 motion-reduce:transition-none motion-reduce:group-hover:rotate-0" />
      <span className="text-sm font-semibold tracking-[0.18em] lowercase">
        oobee<span className="text-brand">·</span>bets
      </span>
      {/* Same chip as the role badge beside it in the admin header, rather
          than the one-off `text-blue-400` span this used to be — that colour
          was a raw Tailwind blue with no token behind it, so it drifted from
          the brand cyan everything else uses. */}
      <Badge variant="brand">Beta</Badge>
    </Link>
  );
}
