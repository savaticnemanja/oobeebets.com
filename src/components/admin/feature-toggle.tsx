"use client";

import { useOptimistic, useTransition } from "react";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { setPickFeaturedAction } from "@/app/actions/admin";
import { setOobeeParlayFeaturedAction } from "@/app/actions/parlays";
import { cn } from "@/lib/utils";

/**
 * The admin's star on a pick or one of Oobee's parlays: featured ones lead
 * their day on the board. Any number per day; works on a published slate too,
 * since it changes how the day is shown, not what was picked.
 */
export function FeatureToggle({
  kind,
  id,
  featured,
  withLabel,
}: {
  kind: "pick" | "parlay";
  id: string;
  featured: boolean;
  /** Spell it out ("Featured" / "Feature") rather than a bare star. */
  withLabel?: boolean;
}) {
  const [on, setOn] = useOptimistic(featured);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !on;
    startTransition(async () => {
      setOn(next);
      const result =
        kind === "pick" ? await setPickFeaturedAction(id, next) : await setOobeeParlayFeaturedAction(id, next);
      if (!result?.ok) toast.error(result?.error ?? "Couldn't change that");
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? "Featured — click to unfeature" : "Feature on the board"}
      title={on ? "Featured — click to unfeature" : "Feature on the board"}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-medium transition-colors",
        on ? "text-pending hover:text-pending/80" : "text-fg-subtle hover:text-fg",
        pending && "opacity-70",
      )}
    >
      <Star className={cn("size-4", on && "fill-current")} aria-hidden="true" />
      {withLabel && (on ? "Featured" : "Feature")}
    </button>
  );
}
