"use client";

import { useActionState, useState } from "react";
import { cancelSubscriptionAction, openPortalAction, resumeSubscriptionAction } from "@/app/actions/billing";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/validation";

function Result({ state }: { state: ActionState }) {
  if (!state) return null;
  return state.ok ? (
    <p className="text-xs text-hit" role="status">
      {state.message}
    </p>
  ) : (
    <p className="text-xs text-miss" role="alert">
      {state.error}
    </p>
  );
}

/**
 * Cancel, with one "are you sure" in place rather than a dialog: the first
 * click says what happens, the second does it.
 */
export function CancelSubscriptionButton({ consequence }: { /** "You keep the board until Nov 17 and aren't charged." */ consequence: string }) {
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(() => cancelSubscriptionAction(), null);
  if (!confirming) {
    return (
      <Button type="button" variant="outline" className="rounded-full" onClick={() => setConfirming(true)}>
        Cancel subscription
      </Button>
    );
  }
  return (
    <form action={action} className="space-y-3 rounded-lg border border-border-strong bg-surface/60 p-4">
      <p className="text-sm text-fg">Cancel your subscription? {consequence}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="danger" className="rounded-full" disabled={pending}>
          {pending ? "Cancelling…" : "Yes, cancel"}
        </Button>
        <Button type="button" variant="ghost" className="rounded-full" onClick={() => setConfirming(false)} disabled={pending}>
          Keep it
        </Button>
      </div>
      <Result state={state} />
    </form>
  );
}

/** Undo a cancellation before it takes effect. */
export function ResumeSubscriptionButton() {
  const [state, action, pending] = useActionState<ActionState, FormData>(() => resumeSubscriptionAction(), null);
  return (
    <form action={action} className="space-y-2">
      <Button type="submit" className="rounded-full" disabled={pending}>
        {pending ? "Renewing…" : "Keep my subscription"}
      </Button>
      <Result state={state} />
    </form>
  );
}

/** Card, invoices and receipts, in Stripe's customer portal. */
export function ManageBillingButton({ label = "Card & invoices" }: { label?: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(() => openPortalAction(), null);
  return (
    <form action={action} className="space-y-2">
      <Button type="submit" variant="outline" className="rounded-full" disabled={pending}>
        {pending ? "Opening…" : label}
      </Button>
      <Result state={state} />
    </form>
  );
}
