"use client";

import * as React from "react";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { settleSelectionAction } from "@/app/actions/admin";
import type { PendingLeg } from "@/lib/odds/board";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTime, formatOdds } from "@/lib/i18n/format";

/**
 * Community-parlay legs that need a result typed by hand — player props,
 * which the feed cannot grade. One row each; settling it grades every
 * parlay it is in.
 */
export function CommunityLegList({ legs }: { legs: PendingLeg[] }) {
  const [state, action, pending] = useActionState(settleSelectionAction, null);
  useEffect(() => {
    if (state?.ok) toast.success(state.message ?? "Settled");
    else if (state && !state.ok) toast.error(state.error);
  }, [state]);

  if (legs.length === 0) {
    return (
      <p className="card-hairline p-6 text-center text-sm text-fg-muted">
        No community legs waiting on you.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {legs.map((l) => (
        <li key={l.selectionId} className="card-hairline p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p className="text-sm text-fg">
              {l.label} <span className="num text-xs text-fg-muted">{formatOdds(l.price)}</span>
            </p>
            <p className="text-xs text-fg-subtle">
              {l.parlays} parlay{l.parlays === 1 ? "" : "s"} waiting
            </p>
          </div>
          <p className="mt-0.5 text-xs text-fg-subtle">
            {l.league} · {l.event} · {formatDateTime(l.commenceTime)} · {l.bookTitle}
          </p>
          <form action={action} className="mt-2 flex flex-wrap items-center gap-2">
            <input type="hidden" name="selectionId" value={l.selectionId} />
            <Input
              name="finalScore"
              placeholder="Stat line (e.g. 2 H)"
              aria-label={`Result for ${l.label}`}
              className="h-8 w-36 text-xs"
            />
            <Button type="submit" name="status" value="won" variant="hit" size="sm" disabled={pending}>Won</Button>
            <Button type="submit" name="status" value="lost" variant="danger" size="sm" disabled={pending}>Lost</Button>
            <Button type="submit" name="status" value="push" variant="subtle" size="sm" disabled={pending}>Push</Button>
            <Input
              name="voidReason"
              placeholder="Void reason"
              aria-label={`Void reason for ${l.label}`}
              className="h-8 w-36 text-xs"
            />
            <Button type="submit" name="status" value="void" variant="outline" size="sm" disabled={pending}>Void</Button>
          </form>
        </li>
      ))}
    </ul>
  );
}
