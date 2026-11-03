"use client";

import { useActionState } from "react";
import { startCheckoutAction, type CheckoutFrom } from "@/app/actions/billing";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ActionState } from "@/lib/validation";

/** Subscribe: follows the redirect to Stripe Checkout. */
export function SubscribeButton({
  from,
  label,
  className,
  size = "default",
  errorClassName,
}: {
  /** Where Checkout's "Back" returns to. */
  from: CheckoutFrom;
  label: string;
  className?: string;
  size?: ButtonProps["size"];
  errorClassName?: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(() => startCheckoutAction(from), null);
  return (
    <form action={action} className="space-y-2">
      <Button type="submit" size={size} className={cn("w-full rounded-full", className)} disabled={pending}>
        {pending ? "Opening checkout…" : label}
      </Button>
      {state && !state.ok && (
        <p className={cn("text-xs text-miss", errorClassName)} role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
