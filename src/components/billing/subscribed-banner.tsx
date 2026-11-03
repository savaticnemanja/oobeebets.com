"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";

/**
 * Shown on /picks?subscribed=1, where Checkout sends people back. The page
 * copies the new subscription from Stripe as it renders, so this is nearly
 * always on at once; if Stripe was slow, it refreshes every two seconds, for
 * half a minute, and the board fills in as soon as the subscription is on file.
 */
export function SubscribedBanner({ on, trialEnds }: { on: boolean; /** "Nov 17", when on a trial. */ trialEnds: string | null }) {
  const router = useRouter();
  useEffect(() => {
    if (on) return;
    let tries = 0;
    const id = setInterval(() => {
      if (++tries > 15) clearInterval(id);
      else router.refresh();
    }, 2000);
    return () => clearInterval(id);
  }, [on, router]);

  return (
    <div role="status" className="flex items-center gap-2 border-b border-border bg-surface/40 px-4 py-3 text-sm">
      {on ? (
        <>
          <CheckCircle2 className="size-4 shrink-0 text-hit" aria-hidden="true" />
          <span>
            {trialEnds ? (
              <>
                Your free trial is on — the whole board is open. Nothing is charged until{" "}
                <span className="font-semibold">{trialEnds}</span>.
              </>
            ) : (
              "You're subscribed — the whole board is open."
            )}
          </span>
        </>
      ) : (
        <>
          <Loader2 className="size-4 shrink-0 animate-spin text-fg-muted" aria-hidden="true" />
          <span className="text-fg-muted">Setting up your subscription…</span>
        </>
      )}
    </div>
  );
}
