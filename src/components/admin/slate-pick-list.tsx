"use client";

import { useActionState, useEffect } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { deletePickAction } from "@/app/actions/admin";
import type { Pick } from "@/db/schema";
import { TIERS, tierForRank } from "@/lib/tiers";
import { cn } from "@/lib/utils";
import { SPORT_EMOJI, STATUS_LABEL, STATUS_VARIANT } from "@/components/pick-card";
import { formatDateTime, formatOdds } from "@/lib/i18n/format";

const TIER_TINT: Record<string, string> = {
  base: "border-l-hit",
  pro: "border-l-brand",
  elite: "border-l-pending",
};

export function SlatePickList({
  picks,
  published,
}: {
  picks: Pick[];
  published: boolean;
}) {
  const [state, action] = useActionState(deletePickAction, null);

  useEffect(() => {
    if (state?.ok) toast.success(state.message ?? "Removed");
    else if (state && !state.ok) toast.error(state.error);
  }, [state]);

  if (picks.length === 0) {
    return (
      <div className="card-hairline flex min-h-64 items-center justify-center p-8 text-center">
        <p className="text-sm text-fg-muted">
          No picks on this slate yet. Add rank 1 to start.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {picks.map((p) => {
        const tier = tierForRank(p.rank);
        return (
          <div
            key={p.id}
            className={cn(
              "card-hairline flex items-start gap-3 border-l-2 p-3",
              TIER_TINT[tier],
            )}
          >
            <span className="num mt-0.5 w-7 shrink-0 text-sm font-semibold text-fg-subtle">
              #{p.rank}
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span aria-hidden="true">{SPORT_EMOJI[p.sport]}</span>
                <span className="font-medium text-fg">{p.selection}</span>
                <span className="num text-sm text-fg-muted">{formatOdds(p.price)}</span>
                <Badge variant={STATUS_VARIANT[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                <Badge variant="outline">{TIERS[tier].name}</Badge>
              </div>
              <p className="mt-0.5 truncate text-xs text-fg-muted">
                {p.league} · {p.event}
              </p>
              <p className="num mt-0.5 text-[0.6875rem] text-fg-subtle">
                {Number(p.units).toFixed(2)}u
                {p.confidence !== null && ` · ${p.confidence}% conf`}
                {" · "}
                {formatDateTime(p.startsAt)}
              </p>
            </div>

            {!published && (
              <form action={action}>
                <input type="hidden" name="pickId" value={p.id} />
                <Button
                  type="submit"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove pick ${p.rank}`}
                  className="text-fg-subtle hover:text-miss"
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </form>
            )}
          </div>
        );
      })}
    </div>
  );
}
