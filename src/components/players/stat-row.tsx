"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * A table row that opens its player when tapped anywhere — the same rule as a
 * post on Home (components/social/post-card.tsx): a click on a link inside
 * goes to that link, selecting text doesn't navigate, and cmd/ctrl-click
 * opens a new tab. The player's name inside is a real link, so keyboards and
 * screen readers have one to follow.
 */
export function StatRow({
  href,
  style,
  className,
  children,
}: {
  href: string;
  style?: React.CSSProperties;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  function open(e: React.MouseEvent<HTMLElement>) {
    const target = e.target as HTMLElement;
    if (!e.currentTarget.contains(target) || target.closest("a,button")) return;
    if (window.getSelection()?.toString()) return;
    if (e.metaKey || e.ctrlKey) window.open(href, "_blank");
    else router.push(href);
  }
  return (
    <div role="row" onClick={open} style={style} className={cn("cursor-pointer", className)}>
      {children}
    </div>
  );
}
