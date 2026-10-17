"use client";

import { useTransition } from "react";
import { CircleCheck, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { setFeedbackResolvedAction } from "@/app/actions/feedback";
import { Button } from "@/components/ui/button";
import { tryAction } from "@/lib/try-action";

/**
 * Marks one piece of feedback dealt with, or opens it again. Not optimistic:
 * the item moves to the other list once the server agrees.
 */
export function FeedbackResolve({ id, resolved }: { id: string; resolved: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await tryAction(() => setFeedbackResolvedAction(id, !resolved));
          if (!result?.ok) toast.error(result?.error ?? "Couldn't change that");
        })
      }
    >
      {resolved ? <RotateCcw aria-hidden="true" /> : <CircleCheck aria-hidden="true" />}
      {resolved ? "Reopen" : "Mark resolved"}
    </Button>
  );
}
