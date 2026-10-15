"use client";

import { useActionState } from "react";
import type { Tier } from "@/db/schema";
import { openPortalAction, startCheckoutAction } from "@/app/actions/billing";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/validation";

/** Choose a plan: posts the tier and follows the redirect to Stripe Checkout. */
export function PlanButton({ tier, label, primary }: { tier: Tier; label: string; primary?: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(startCheckoutAction, null);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="tier" value={tier} />
      <Button type="submit" variant={primary ? "default" : "outline"} className="w-full rounded-full" disabled={pending}>
        {pending ? "Opening checkout…" : label}
      </Button>
      {state && !state.ok && <p className="text-xs text-miss" role="alert">{state.error}</p>}
    </form>
  );
}

/** Card, invoices, switching and cancelling — Stripe's customer portal. */
export function ManagePlanButton() {
  const [state, action, pending] = useActionState<ActionState, FormData>(() => openPortalAction(), null);
  return (
    <form action={action} className="space-y-2">
      <Button type="submit" variant="outline" className="rounded-full" disabled={pending}>
        {pending ? "Opening…" : "Manage plan"}
      </Button>
      {state && !state.ok && <p className="text-xs text-miss" role="alert">{state.error}</p>}
    </form>
  );
}
