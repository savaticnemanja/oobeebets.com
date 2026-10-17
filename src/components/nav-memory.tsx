"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

/**
 * What the app remembers about how you got here — enough to make "back"
 * behave like it does on X:
 *
 *   - BackButton goes back through history when you came from inside the
 *     app, so you land where you were, not at the top of a fresh page; on a
 *     link opened cold (a shared /p/… URL) it goes to `fallback` instead.
 *   - cameBack() tells a list it is being returned to (browser back or
 *     forward, a phone's back gesture, or BackButton) rather than opened
 *     afresh — LoadMore then restores what it had loaded and where you were.
 */

let poppedAt = 0;
let depth = 0;

if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    poppedAt = Date.now();
  });
}

/** True right after a back/forward navigation. */
export function cameBack(): boolean {
  return Date.now() - poppedAt < 1500;
}

/** Counts in-app pages, so BackButton knows whether back stays in the app. Mounted once, in AppShell. */
export function NavTracker() {
  const pathname = usePathname();
  React.useEffect(() => {
    depth = cameBack() ? Math.max(1, depth - 1) : depth + 1;
  }, [pathname]);
  return null;
}

export function BackButton({
  fallback,
  label,
  className = "grid size-9 shrink-0 place-items-center rounded-full transition-colors hover:bg-surface-2",
}: {
  fallback: string;
  label: string;
  className?: string;
}) {
  const router = useRouter();
  return (
    <Link
      href={fallback}
      aria-label={label}
      onClick={(e) => {
        if (depth > 1 && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
          e.preventDefault();
          router.back();
        }
      }}
      className={className}
    >
      <ArrowLeft className="size-5" aria-hidden="true" />
    </Link>
  );
}
