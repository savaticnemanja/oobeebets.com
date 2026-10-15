"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatOdds } from "@/lib/i18n/format";

export type SettleChoice = "won" | "lost" | "push" | "void";

export interface SettleTarget {
  /** Posted as `idField` — a pick's id, or a selection's. */
  id: string;
  title: string;
  sub: string;
  price: number;
  status: SettleChoice;
}

const VERB: Record<SettleChoice, string> = { won: "Won", lost: "Lost", push: "Push", void: "Void" };

/**
 * Grading one bet, confirmed. A result goes on the public record and moves
 * every rate, so no grade is ever a single click: the button names the
 * result, and this asks once more, with the bet in front of you. The final
 * score (optional) or, for a void, the reason (required — it's audited) is
 * typed here, in the dialog, where nothing resets it.
 */
export function SettleConfirm({
  target,
  onClose,
  action,
  idField,
  scoreLabel = "Final score",
  scorePlaceholder = "e.g. 24–20",
}: {
  target: SettleTarget | null;
  onClose: () => void;
  action: (formData: FormData) => void;
  idField: "pickId" | "selectionId";
  scoreLabel?: string;
  scorePlaceholder?: string;
}) {
  const isVoid = target?.status === "void";
  return (
    <Dialog open={Boolean(target)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        {target && (
          // Closed on submit, not on the result: the outcome arrives as a toast.
          <form action={action} onSubmit={onClose}>
            <DialogHeader>
              <DialogTitle>{isVoid ? "Void this bet?" : `Settle as ${VERB[target.status]}?`}</DialogTitle>
              <DialogDescription>
                {isVoid
                  ? "It stays on the record marked void, and comes out of every rate and net units. The reason goes in the audit log."
                  : "This goes on the public record and grades every parlay it's in. You can reopen it later if it's wrong."}
              </DialogDescription>
            </DialogHeader>
            <input type="hidden" name={idField} value={target.id} />
            <input type="hidden" name="status" value={target.status} />
            <div className="rounded-lg border border-border bg-surface p-3 text-sm">
              <span className="font-medium text-fg">{target.title}</span>{" "}
              <span className="num text-fg-muted">{formatOdds(target.price)}</span>
              <p className="mt-0.5 text-xs text-fg-muted">{target.sub}</p>
            </div>
            <div className="mt-4">
              {isVoid ? (
                <>
                  <Label htmlFor="settle-reason">Reason</Label>
                  <Input
                    id="settle-reason"
                    name="voidReason"
                    required
                    autoFocus
                    placeholder="Game postponed / line was wrong"
                    className="mt-1.5"
                  />
                </>
              ) : (
                <>
                  <Label htmlFor="settle-score">
                    {scoreLabel} <span className="font-normal text-fg-subtle">(optional)</span>
                  </Label>
                  <Input id="settle-score" name="finalScore" autoFocus placeholder={scorePlaceholder} className="mt-1.5" />
                </>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                variant={target.status === "won" ? "hit" : target.status === "push" ? "subtle" : "danger"}
              >
                {isVoid ? "Void it" : `Settle as ${VERB[target.status]}`}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
