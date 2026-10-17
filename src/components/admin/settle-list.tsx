"use client";

import * as React from "react";
import { useActionState, useEffect } from "react";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/misc";
import { SettleConfirm, type SettleChoice, type SettleTarget } from "@/components/admin/settle-confirm";
import { settlePickAction, unsettlePickAction } from "@/app/actions/admin";
import type { Pick } from "@/db/schema";
import { cn } from "@/lib/utils";
import { pickProfit } from "@/lib/settlement";
import { SPORT_EMOJI, STATUS_LABEL, STATUS_VARIANT } from "@/components/pick-card";
import { formatOdds, formatSlateDate, formatUnits } from "@/lib/i18n/format";
import { CATEGORY_NOUN } from "@/lib/board";
import { LocalTime } from "@/components/local-time";

export function SettleList({
  picks,
  emptyMessage,
  muted,
  settled,
  scores,
  hideEvent,
}: {
  picks: Pick[];
  emptyMessage: string;
  muted?: boolean;
  settled?: boolean;
  /** The feed's final score per pick id, to fill in the confirm dialog. */
  scores?: Record<string, string>;
  /** The rows sit under a heading naming the game already. */
  hideEvent?: boolean;
}) {
  const [state, action] = useActionState(settlePickAction, null);
  const [unsetState, unsetAction] = useActionState(unsettlePickAction, null);
  const [target, setTarget] = React.useState<SettleTarget | null>(null);
  const [reopen, setReopen] = React.useState<Pick | null>(null);
  const choose = (p: Pick, status: SettleChoice) =>
    setTarget({ id: p.id, title: p.selection, sub: p.event, price: p.price, status, score: scores?.[p.id] ?? null });

  // Toasting is talking to an external system, which is what effects are for.
  // Closing the dialog is not done here — see SettleConfirm's onSubmit.
  useEffect(() => {
    const s = state ?? unsetState;
    if (s?.ok) toast.success(s.message ?? "Settled");
    else if (s && !s.ok) toast.error(s.error);
  }, [state, unsetState]);

  if (picks.length === 0) {
    return emptyMessage ? (
      <p className="card-hairline p-8 text-center text-sm text-fg-muted">{emptyMessage}</p>
    ) : null;
  }

  return (
    <>
      {/* `muted` used to be opacity-70 on this wrapper, which fades the text and
          the card under it together: every foreground in the group landed
          between 2.9:1 and 4.1:1, and it would have taken 0.95 to clear 4.5 —
          by which point there is no visible de-emphasis left. Recede the card
          chrome instead and leave the text alone. The group is already
          announced by its own heading; this is only a visual echo of that. */}
      <div className="space-y-2">
        {picks.map((p) => {
          const profit = pickProfit(p);
          return (
            <div
              key={p.id}
              data-pick-id={p.id}
              className={cn("card-hairline p-3", muted && "bg-transparent border-border/60")}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="num text-xs text-fg-subtle">#{p.rank}</span>
                    <span aria-hidden="true">{SPORT_EMOJI[p.sport]}</span>
                    <span className="font-medium text-fg">{p.selection}</span>
                    <span className="num text-sm text-fg-muted">{formatOdds(p.price)}</span>
                    {settled && (
                      <Badge variant={STATUS_VARIANT[p.status]}>
                        {STATUS_LABEL[p.status]}
                      </Badge>
                    )}
                    {settled && p.status !== "void" && (
                      <span
                        className={cn(
                          "num text-xs font-semibold",
                          profit > 0 ? "text-hit" : profit < 0 ? "text-miss" : "text-fg-muted",
                        )}
                      >
                        {formatUnits(profit)}
                      </span>
                    )}
                  </div>
                  {!hideEvent && <p className="mt-0.5 truncate text-xs text-fg-muted">{p.event}</p>}
                  <p className="num mt-0.5 text-[0.6875rem] text-fg-subtle">
                    {CATEGORY_NOUN[p.category].replace(/^./, (c) => c.toUpperCase())} · {formatSlateDate(p.slateDate)}
                    {!hideEvent && (
                      <>
                        {" "}· <LocalTime at={p.startsAt} format="datetime" />
                      </>
                    )}
                    {p.finalScore && ` · Final ${p.finalScore}`}
                    {settled && p.settledAt && (
                      <>
                        {" "}· {p.settledBy ? "settled" : "graded"} <LocalTime at={p.settledAt} format="datetime" />
                      </>
                    )}
                  </p>
                </div>

                {settled ? (
                  <Button type="button" variant="ghost" size="sm" className="text-fg-subtle" onClick={() => setReopen(p)}>
                    <RotateCcw aria-hidden="true" />
                    Reopen
                  </Button>
                ) : (
                  // Each names a result and asks before it's recorded (SettleConfirm).
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button type="button" variant="hit" size="sm" onClick={() => choose(p, "won")}>
                      Won
                    </Button>
                    <Button type="button" variant="danger" size="sm" onClick={() => choose(p, "lost")}>
                      Lost
                    </Button>
                    <Button type="button" variant="subtle" size="sm" onClick={() => choose(p, "push")}>
                      Push
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => choose(p, "void")} className="text-fg-subtle">
                      Void
                    </Button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <SettleConfirm target={target} onClose={() => setTarget(null)} action={action} idField="pickId" />

      {/* Reopening takes a result back off the record — asked first, too. */}
      <AlertDialog open={Boolean(reopen)} onOpenChange={(o) => !o && setReopen(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>Reopen this pick?</AlertDialogTitle>
          <AlertDialogDescription>
            {reopen ? `${reopen.selection} goes back to pending and comes off the record until it's settled again.` : null}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button type="button" variant="outline">Keep it settled</Button>
            </AlertDialogCancel>
            {/* Not a form submit: AlertDialogAction closes the dialog on
                click, which cleared `reopen` (and with it the hidden pick id)
                before the form posted — so Reopen did nothing. The id is taken
                from this render instead. */}
            <AlertDialogAction asChild>
              <Button
                type="button"
                variant="danger"
                onClick={() => {
                  if (!reopen) return;
                  const data = new FormData();
                  data.set("pickId", reopen.id);
                  React.startTransition(() => unsetAction(data));
                }}
              >
                Reopen
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
