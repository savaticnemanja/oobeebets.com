"use client";

import { useActionState } from "react";
import Link from "next/link";
import { leaveWaitlistAction } from "@/app/actions/waitlist";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/validation";

export function LeaveWaitlistForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(leaveWaitlistAction, null);

  if (state?.ok) {
    return (
      <div role="status" className="space-y-4">
        <p className="text-sm text-fg">{state.message}</p>
        <Link href="/" className="text-sm text-brand hover:underline">
          Back to oobee bets
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <Button type="submit" variant="outline" className="w-full" disabled={pending}>
        {pending ? "Leaving…" : "Yes, take me off the waitlist"}
      </Button>
      {state && !state.ok && (
        <p role="alert" className="text-sm text-miss">
          {state.error}
        </p>
      )}
    </form>
  );
}
