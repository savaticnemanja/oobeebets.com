"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";

/**
 * Shown on /picks?subscribed=1, where Checkout sends people back. Stripe's
 * webhook (what actually unlocks the plan) can land a moment after the
 * redirect, so until it has, this refreshes the page every two seconds, for
 * half a minute, and the board fills in as soon as the plan is on file.
 */
export function SubscribedBanner({ tierName }: { tierName: string | null }) {
  const router = useRouter();
  useEffect(() => {
    if (tierName) return;
    let tries = 0;
    const id = setInterval(() => {
      if (++tries > 15) clearInterval(id);
      else router.refresh();
    }, 2000);
    return () => clearInterval(id);
  }, [tierName, router]);

  return (
    <div role="status" className="flex items-center gap-2 border-b border-border bg-surface/40 px-4 py-3 text-sm">
      {tierName ? (
        <>
          <CheckCircle2 className="size-4 shrink-0 text-hit" aria-hidden="true" />
          <span>
            You&apos;re on <span className="font-semibold">{tierName}</span> — your picks are unlocked.
          </span>
        </>
      ) : (
        <>
          <Loader2 className="size-4 shrink-0 animate-spin text-fg-muted" aria-hidden="true" />
          <span className="text-fg-muted">Payment received — unlocking your plan…</span>
        </>
      )}
    </div>
  );
}
