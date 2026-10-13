"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteUserParlayAction } from "@/app/actions/parlays";
import type { PickCategory } from "@/db/schema";
import { tryAction } from "@/lib/try-action";

/** A pick an Oobee parlay can be built from — the admin parlay composer's options. */
export interface SelectableLeg {
  id: string;
  rank: number;
  category: PickCategory;
  league: string;
  event: string;
  selection: string;
  price: number;
  startsAt: Date;
}

// The builder that used to live here only offered Oobee's published picks.
// Testers now build from the whole odds feed on the Community parlays tab —
// see components/community-parlay-builder.tsx.

/**
 * The owner's own delete control, shown on a ticket while every leg is still
 * ahead of kick-off. Slotted into ParlayCard rather than built into it,
 * because the same card renders on surfaces where nobody may delete anything.
 */
export function DeleteParlayButton({ parlayId }: { parlayId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await tryAction(() => deleteUserParlayAction(parlayId));
          if (result?.ok) {
            toast.success(result.message ?? "Removed");
            router.refresh();
          } else if (result) {
            toast.error(result.error);
          }
        })
      }
    >
      <Trash2 aria-hidden="true" />
      {pending ? "Removing…" : "Remove"}
    </Button>
  );
}
