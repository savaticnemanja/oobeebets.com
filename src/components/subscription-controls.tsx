"use client";

import { useActionState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/misc";
import {
  cancelSubscriptionAction,
  changeTierAction,
  resumeSubscriptionAction,
} from "@/app/actions/billing";
import { TIERS, TIER_ORDER } from "@/lib/tiers";
import type { Tier } from "@/db/schema";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/i18n/format";

export function SubscriptionControls({
  currentTier,
  cancelAtPeriodEnd,
  pricing,
}: {
  currentTier: Tier;
  cancelAtPeriodEnd: boolean;
  pricing: Record<Tier, number>;
}) {
  const [changeState, changeAction, changing] = useActionState(changeTierAction, null);
  const [pending, startTransition] = useTransition();

  const others = TIER_ORDER.filter((t) => t !== currentTier);

  function run(fn: () => Promise<{ ok: boolean; message?: string; error?: string } | null>) {
    startTransition(async () => {
      const res = await fn();
      if (res?.ok) toast.success(res.message ?? "Done");
      else if (res) toast.error(res.error ?? "Something went wrong");
    });
  }

  return (
    <div className="space-y-4">
      {changeState && !changeState.ok && (
        <p role="alert" className="text-sm text-miss">
          {changeState.error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {others.map((t) => (
          <form action={changeAction} key={t}>
            <input type="hidden" name="tier" value={t} />
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={changing || cancelAtPeriodEnd}
            >
              {changing && <Loader2 className="animate-spin" aria-hidden="true" />}
              Switch to {TIERS[t].name} · {formatMoney(pricing[t])}
            </Button>
          </form>
        ))}
      </div>

      {cancelAtPeriodEnd ? (
        <Button
          variant="hit"
          size="sm"
          disabled={pending}
          onClick={() => run(resumeSubscriptionAction)}
        >
          {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
          Resume subscription
        </Button>
      ) : (
        <AlertDialog>
          <AlertDialogTrigger
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
          >
            Cancel subscription
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogTitle>Cancel your subscription?</AlertDialogTitle>
            <AlertDialogDescription>
              You keep access until the end of the period you&apos;ve already paid for.
              After that the board locks back to the free Top Pick of the Day.
              <br />
              <br />
              Worth knowing: your current price is locked while you stay subscribed. If
              you come back later you&apos;ll pay whatever the price is then.
            </AlertDialogDescription>
            <AlertDialogFooter>
              <AlertDialogCancel
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                Keep it
              </AlertDialogCancel>
              <AlertDialogAction onClick={() => run(cancelSubscriptionAction)}>
                Cancel subscription
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
