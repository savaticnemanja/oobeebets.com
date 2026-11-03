import { Lock } from "lucide-react";
import { SubscribeButton } from "@/components/billing/subscribe-button";

/**
 * Where a non-subscriber's board stops: one full-width row, the same width
 * as a pick, saying what's held back. The locked picks themselves are never
 * sent — only their count. Its button goes straight to checkout, as the
 * banner's at the top of the board does.
 */
export function UnlockRow({ what }: { what: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-4">
      <p className="flex min-w-0 items-center gap-2 text-sm text-fg-muted">
        <Lock className="size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
        <span>
          <span className="text-fg">{what}</span> for subscribers
        </span>
      </p>
      <div className="shrink-0">
        <SubscribeButton from="picks" size="sm" label="Unlock" className="w-auto" />
      </div>
    </div>
  );
}
