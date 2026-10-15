"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

const UnreadContext = React.createContext(0);

/** How often an open tab checks for new notifications. */
const POLL_MS = 60_000;

/**
 * The unread count behind the Notifications badge. The layout renders once
 * per visit, not per page, so the count it starts with goes stale as you
 * move around: this asks again on every navigation, every minute, and when
 * the tab comes back into view. On the notifications page itself it's zero —
 * opening the page reads them.
 */
export function UnreadProvider({ initial, children }: { initial: number; children: React.ReactNode }) {
  const [count, setCount] = React.useState(initial);
  const pathname = usePathname();
  const first = React.useRef(true);

  React.useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const res = await fetch("/api/notifications/unread", { cache: "no-store" });
        if (!res.ok) return;
        const { unread } = (await res.json()) as { unread: number };
        if (!cancelled) setCount(pathname === "/notifications" ? 0 : unread);
      } catch {
        // Offline, or the session lapsed: keep showing the last count.
      }
    }
    // The layout's count is fresh on the first render; no need to ask again
    // — unless this is the notifications page, where it's about to be zero.
    if (!first.current || pathname === "/notifications") void refresh();
    first.current = false;

    const timer = setInterval(refresh, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pathname]);

  // Zero on the page itself straight away, before the fetch says so.
  return <UnreadContext.Provider value={pathname === "/notifications" ? 0 : count}>{children}</UnreadContext.Provider>;
}

export function useUnread(): number {
  return React.useContext(UnreadContext);
}

/** The count on the bell, X's blue dot with a number in it. */
export function UnreadBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      aria-hidden="true"
      className={
        "absolute -right-1.5 -top-1 grid h-[1.125rem] min-w-[1.125rem] place-items-center rounded-full bg-brand px-1 text-[0.6875rem] font-bold leading-none text-black ring-2 ring-black " +
        (className ?? "")
      }
    >
      {count > 20 ? "20+" : count}
    </span>
  );
}
