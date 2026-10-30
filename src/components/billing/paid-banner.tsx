"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";

/**
 * Shown on /picks?paid=1, where Checkout sends people back. Stripe's webhook
 * (what actually unlocks the pass) can land a moment after the redirect, so
 * until it has, this refreshes the page every two seconds, for half a minute,
 * and the board fills in as soon as the pass is on file.
 */
export function PaidBanner({ until }: { until: string | null }) {
  const router = useRouter();
  useEffect(() => {
    if (until) return;
    let tries = 0;
    const id = setInterval(() => {
      if (++tries > 15) clearInterval(id);
      else router.refresh();
    }, 2000);
    return () => clearInterval(id);
  }, [until, router]);

  return (
    <div role="status" className="flex items-center gap-2 border-b border-border bg-surface/40 px-4 py-3 text-sm">
      {until ? (
        <>
          <CheckCircle2 className="size-4 shrink-0 text-hit" aria-hidden="true" />
          <span>
            Your pass is on — the whole board is unlocked until <span className="font-semibold">{until}</span>.
          </span>
        </>
      ) : (
        <>
          <Loader2 className="size-4 shrink-0 animate-spin text-fg-muted" aria-hidden="true" />
          <span className="text-fg-muted">Payment received — unlocking your pass…</span>
        </>
      )}
    </div>
  );
}
