"use client";

import { useActionState, useEffect, useState } from "react";
import { Check, Circle, Layers } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createOobeeParlayAction } from "@/app/actions/parlays";
import {
  MAX_PARLAY_LEGS,
  MIN_PARLAY_LEGS,
} from "@/lib/parlays";
import { americanToDecimal, combineOdds } from "@/lib/settlement";
import { formatKickoff, formatOdds, timeZoneLabel } from "@/lib/i18n/format";
import { CATEGORY_LABELS, PARLAYS_PER_SLATE } from "@/lib/board";
import type { SelectableLeg } from "@/components/parlay-builder";
import { cn } from "@/lib/utils";

/**
 * Where Oobee builds a parlay for its own board tab.
 *
 * Same leg-picking as the tester's builder, plus the things only a published
 * recommendation carries: a stake, a confidence, an edge, the reasoning, and
 * — the one that matters — the price the book is actually offering.
 *
 * That price field is why this is not just the tester's builder with a save
 * button. Correlated legs price worse than the product of their parts, so a
 * same-game three-leg the maths calls +600 might be +480 at the book. Left
 * blank the legs decide; filled in, Oobee's number wins until a leg drops out.
 * See parlayPrice in lib/parlays.ts.
 */
export function ParlayComposer({
  date,
  legs,
  parlayCount,
  disabled,
}: {
  date: string;
  legs: SelectableLeg[];
  parlayCount: number;
  disabled: boolean;
}) {
  const [state, formAction, pending] = useActionState(createOobeeParlayAction, null);
  const [selected, setSelected] = useState<string[]>([]);

  // Clearing the legs is a render-phase adjustment, not an effect: React's
  // "store information from previous renders" pattern. Doing it in an effect
  // sets state after paint and costs a second render of the whole list.
  //
  // It only clears on success, deliberately. A rejected submit keeps the legs
  // selected so the admin can fix the price and resend rather than rebuilding
  // the ticket from scratch — same reasoning as keeping form answers on a
  // failed submit elsewhere in the panel.
  const [handled, setHandled] = useState(state);
  if (state !== handled) {
    setHandled(state);
    if (state?.ok) setSelected([]);
  }

  // The toast is a genuine effect: sonner is an external system being told
  // about a state change, which is what effects are for.
  useEffect(() => {
    if (state?.ok) toast.success(state.message ?? "Parlay added");
    else if (state && !state.ok) toast.error(state.error);
  }, [state]);

  const chosen = legs.filter((l) => selected.includes(l.id));
  const derived = combineOdds(chosen.map((l) => l.price));
  const tooFew = selected.length < MIN_PARLAY_LEGS;
  const full = selected.length >= MAX_PARLAY_LEGS;
  const boardFull = parlayCount >= PARLAYS_PER_SLATE;

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length >= MAX_PARLAY_LEGS
          ? prev
          : [...prev, id],
    );
  }

  if (disabled) {
    return (
      <div className="card-hairline p-5">
        <p className="text-sm text-fg-muted">
          Slate is published — parlays are locked with the rest of the board.
        </p>
      </div>
    );
  }

  if (boardFull) {
    return (
      <div className="card-hairline p-5">
        <p className="text-sm text-fg-muted">
          Parlay board is full — {PARLAYS_PER_SLATE} is the daily limit. Remove one
          to add another.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="card-hairline overflow-hidden">
      <input type="hidden" name="slateDate" value={date} />
      {selected.map((id) => (
        <input key={id} type="hidden" name="legIds" value={id} />
      ))}

      <div className="border-b border-border p-5 pb-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <Layers className="size-4 text-brand" aria-hidden="true" />
          Build a parlay
        </h2>
        <p className="mt-1 text-xs text-fg-subtle">
          {parlayCount}/{PARLAYS_PER_SLATE} today. Legs come off this slate&apos;s own
          picks, so every one is already logged and will be graded on its own.
        </p>
      </div>

      {/* ------------------------------------------------------------- legs */}
      {legs.length === 0 ? (
        <p className="p-5 text-sm text-fg-muted">
          No picks available — add some to the game or prop board first, and make
          sure they are still ahead of kick-off.
        </p>
      ) : (
        <ul className="max-h-72 overflow-y-auto overscroll-contain border-b border-border">
          {legs.map((l) => {
            const on = selected.includes(l.id);
            return (
              <li key={l.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  aria-label={`Add leg: ${l.selection}`}
                  disabled={!on && full}
                  onClick={() => toggle(l.id)}
                  className={cn(
                    "flex w-full items-center gap-3 border-b border-border px-4 py-2 text-left transition-colors",
                    "last:border-b-0 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40",
                    "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand",
                    on && "bg-brand/5",
                  )}
                >
                  <span className={cn("shrink-0", on ? "text-brand" : "text-fg-subtle")}>
                    {on ? (
                      <Check className="size-4" strokeWidth={3} aria-hidden="true" />
                    ) : (
                      <Circle className="size-4" aria-hidden="true" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className="num text-[0.6875rem] text-fg-subtle">
                        #{l.rank}
                      </span>
                      <span className="text-sm text-fg">{l.selection}</span>
                      <span className="num text-xs text-fg-muted">
                        {formatOdds(l.price)}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-fg-subtle">
                      {CATEGORY_LABELS[l.category]} · {l.event} ·{" "}
                      <span className="num">
                        {formatKickoff(l.startsAt)} {timeZoneLabel()}
                      </span>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* ----------------------------------------------------------- details */}
      <div className="space-y-4 p-5">
        <p className="text-xs">
          <span className="num text-fg">{selected.length}</span>
          <span className="text-fg-subtle"> legs selected</span>
          {derived !== null && (
            <>
              <span className="text-fg-subtle"> · legs price at </span>
              <span className="num font-semibold text-brand">{formatOdds(derived)}</span>
              <span className="num text-fg-subtle">
                {" "}
                ({americanToDecimal(derived).toFixed(2)}x)
              </span>
            </>
          )}
        </p>

        <div>
          <Label htmlFor="parlay-title">Name (optional)</Label>
          <Input id="parlay-title" name="title" placeholder="Sunday three-leg" maxLength={80} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="parlay-price">Book price</Label>
            <Input
              id="parlay-price"
              name="price"
              inputMode="numeric"
              placeholder={derived !== null ? String(derived) : "+600"}
            />
            <p className="mt-1 text-[0.6875rem] text-fg-subtle">
              Blank uses the legs.
            </p>
          </div>
          <div>
            <Label htmlFor="parlay-units">Stake (units)</Label>
            <Input
              id="parlay-units"
              name="units"
              inputMode="decimal"
              defaultValue="1"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="parlay-confidence">Confidence %</Label>
            <Input id="parlay-confidence" name="confidence" inputMode="numeric" />
          </div>
          <div>
            <Label htmlFor="parlay-ev">EV %</Label>
            <Input id="parlay-ev" name="evPct" inputMode="decimal" />
          </div>
        </div>

        <div>
          <Label htmlFor="parlay-book">Book</Label>
          <Input id="parlay-book" name="book" placeholder="FD/DK" maxLength={60} />
        </div>

        <div>
          <Label htmlFor="parlay-reasoning">Reasoning</Label>
          <textarea
            id="parlay-reasoning"
            name="reasoning"
            rows={3}
            maxLength={1000}
            className="mt-1.5 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand touch:text-base"
          />
        </div>

        <Button type="submit" className="w-full" disabled={tooFew || pending}>
          {pending
            ? "Adding…"
            : tooFew
              ? `Select at least ${MIN_PARLAY_LEGS} legs`
              : `Add ${selected.length}-leg parlay`}
        </Button>

        {state && !state.ok && (
          <p role="alert" className="text-xs text-miss">
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}
