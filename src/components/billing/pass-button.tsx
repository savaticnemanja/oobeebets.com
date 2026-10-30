"use client";

import { useActionState } from "react";
import { startCheckoutAction } from "@/app/actions/billing";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/validation";

/** Buy a pass: follows the redirect to Stripe Checkout. */
export function PassButton({ label }: { label: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(() => startCheckoutAction(), null);
  return (
    <form action={action} className="space-y-2">
      <Button type="submit" className="w-full rounded-full" disabled={pending}>
        {pending ? "Opening checkout…" : label}
      </Button>
      {state && !state.ok && <p className="text-xs text-miss" role="alert">{state.error}</p>}
    </form>
  );
}
