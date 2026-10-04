"use client";

import { useActionState, useEffect } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteOobeeParlayAction } from "@/app/actions/parlays";

/**
 * Removes one of Oobee's own parlays while the slate is still a draft. The
 * action refuses once it is published — settling the legs is what grades a
 * published parlay, and deleting one would rewrite the record.
 */
export function DeleteOobeeParlayButton({ parlayId }: { parlayId: string }) {
  const [state, action, pending] = useActionState(deleteOobeeParlayAction, null);

  useEffect(() => {
    if (state?.ok) toast.success(state.message ?? "Removed");
    else if (state && !state.ok) toast.error(state.error);
  }, [state]);

  return (
    <form action={action}>
      <input type="hidden" name="parlayId" value={parlayId} />
      <Button type="submit" variant="ghost" size="sm" disabled={pending}>
        <Trash2 aria-hidden="true" />
        {pending ? "Removing…" : "Remove"}
      </Button>
    </form>
  );
}
