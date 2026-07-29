"use client";

import * as React from "react";
import { useActionState, useEffect } from "react";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { settlePickAction, unsettlePickAction } from "@/app/actions/admin";
import type { Pick } from "@/db/schema";
import { cn, formatOdds, formatUnits } from "@/lib/utils";
import { pickProfit } from "@/lib/settlement";
import { SPORT_EMOJI, STATUS_LABEL, STATUS_VARIANT } from "@/components/pick-card";
import { formatSlateDate } from "@/lib/slate-date";

export function SettleList({
  picks,
  emptyMessage,
  muted,
  settled,
}: {
  picks: Pick[];
  emptyMessage: string;
  muted?: boolean;
  settled?: boolean;
}) {
  const [state, action] = useActionState(settlePickAction, null);
  const [unsetState, unsetAction] = useActionState(unsettlePickAction, null);
  const [voidTarget, setVoidTarget] = React.useState<Pick | null>(null);

  // Toasting is talking to an external system, which is what effects are for.
  // Closing the dialog is not done here — see the void form's onSubmit.
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
                  <p className="mt-0.5 truncate text-xs text-fg-muted">{p.event}</p>
                  <p className="num mt-0.5 text-[0.6875rem] text-fg-subtle">
                    {formatSlateDate(p.slateDate)} ·{" "}
                    {p.startsAt.toLocaleString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {p.finalScore && ` · Final ${p.finalScore}`}
                  </p>
                </div>

                {settled ? (
                  <form action={unsetAction}>
                    <input type="hidden" name="pickId" value={p.id} />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="sm"
                      className="text-fg-subtle"
                    >
                      <RotateCcw aria-hidden="true" />
                      Reopen
                    </Button>
                  </form>
                ) : (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <form action={action} className="contents">
                      <input type="hidden" name="pickId" value={p.id} />
                      <Input
                        name="finalScore"
                        placeholder="Final score"
                        aria-label={`Final score for ${p.event}`}
                        className="h-8 w-28 text-xs"
                      />
                      <Button type="submit" name="status" value="won" variant="hit" size="sm">
                        Won
                      </Button>
                      <Button type="submit" name="status" value="lost" variant="danger" size="sm">
                        Lost
                      </Button>
                      <Button type="submit" name="status" value="push" variant="subtle" size="sm">
                        Push
                      </Button>
                    </form>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setVoidTarget(p)}
                      className="text-fg-subtle"
                    >
                      Void
                    </Button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* A void needs a written reason — it removes a pick from every rate, so
          it must never be a silent one-click action. */}
      <Dialog open={Boolean(voidTarget)} onOpenChange={(o) => !o && setVoidTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Void this pick?</DialogTitle>
            <DialogDescription>
              It stays visible on the public record marked void, and is excluded from
              every rate and from net units. The reason is stored in the audit log.
            </DialogDescription>
          </DialogHeader>

          {voidTarget && (
            // Close on submit rather than on the action's result: the outcome
            // arrives as a toast either way, and this keeps the dialog from
            // sitting open while the server round-trips.
            <form action={action} onSubmit={() => setVoidTarget(null)}>
              <input type="hidden" name="pickId" value={voidTarget.id} />
              <input type="hidden" name="status" value="void" />
              <div className="rounded-lg border border-border bg-surface p-3 text-sm">
                <span className="font-medium text-fg">{voidTarget.selection}</span>{" "}
                <span className="num text-fg-muted">{formatOdds(voidTarget.price)}</span>
                <p className="mt-0.5 text-xs text-fg-muted">{voidTarget.event}</p>
              </div>

              <div className="mt-4">
                <Label htmlFor="voidReason">Reason</Label>
                <Input
                  id="voidReason"
                  name="voidReason"
                  required
                  autoFocus
                  placeholder="Game postponed / line was wrong on publish"
                  className="mt-1.5"
                />
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setVoidTarget(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="danger" size="sm">
                  Void pick
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
