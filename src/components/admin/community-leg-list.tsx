"use client";

import * as React from "react";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { settleSelectionAction } from "@/app/actions/admin";
import type { PendingLeg } from "@/lib/odds/board";
import { Button } from "@/components/ui/button";
import { SettleConfirm, type SettleChoice, type SettleTarget } from "@/components/admin/settle-confirm";
import { formatDateTime, formatOdds } from "@/lib/i18n/format";

/**
 * Community-parlay legs that need a result typed by hand — player props,
 * which the feed cannot grade. One row each; settling it grades every
 * parlay it is in.
 */
export function CommunityLegList({ legs }: { legs: PendingLeg[] }) {
  const [state, action, pending] = useActionState(settleSelectionAction, null);
  const [target, setTarget] = React.useState<SettleTarget | null>(null);
  const choose = (l: PendingLeg, status: SettleChoice) =>
    setTarget({ id: l.selectionId, title: l.label, sub: `${l.league} · ${l.event}`, price: l.price, status });
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
          {/* Each names a result and asks before it's recorded (SettleConfirm). */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button type="button" variant="hit" size="sm" disabled={pending} onClick={() => choose(l, "won")}>Won</Button>
            <Button type="button" variant="danger" size="sm" disabled={pending} onClick={() => choose(l, "lost")}>Lost</Button>
            <Button type="button" variant="subtle" size="sm" disabled={pending} onClick={() => choose(l, "push")}>Push</Button>
            <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => choose(l, "void")}>Void</Button>
          </div>
        </li>
      ))}
      <SettleConfirm
        target={target}
        onClose={() => setTarget(null)}
        action={action}
        idField="selectionId"
        scoreLabel="Stat line"
        scorePlaceholder="e.g. 2 H"
      />
    </ul>
  );
}
