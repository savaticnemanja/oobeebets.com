"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Circle, Layers, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createUserParlayAction, deleteUserParlayAction } from "@/app/actions/parlays";
import {
  MAX_PARLAY_LEGS,
  MIN_PARLAY_LEGS,
  PARLAY_STAKE_UNITS,
} from "@/lib/parlays";
import { americanToDecimal, combineOdds } from "@/lib/settlement";
import { formatKickoff, formatOdds, timeZoneLabel } from "@/lib/i18n/format";
import { CATEGORY_LABELS } from "@/lib/board";
import type { PickCategory } from "@/db/schema";
import { cn } from "@/lib/utils";

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

/**
 * Where a tester builds their own parlay out of the day's board.
 *
 * The price updates as legs are ticked, computed on the client by the same
 * combineOdds the server grades with — lib/parlays.ts and lib/settlement.ts are
 * pure and carry no database, so both sides run one implementation rather than
 * two that agree by inspection. What the tester sees before saving is exactly
 * what the ticket will say afterwards.
 *
 * Only picks still ahead of kick-off are ever listed, and the action re-checks
 * that server-side: this list is a convenience, not the gate.
 */
export function ParlayBuilder({ legs }: { legs: SelectableLeg[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const chosen = legs.filter((l) => selected.includes(l.id));
  const price = combineOdds(chosen.map((l) => l.price));
  const stake = Number(PARLAY_STAKE_UNITS);
  const returns = price === null ? null : stake * americanToDecimal(price);

  const tooFew = selected.length < MIN_PARLAY_LEGS;
  const full = selected.length >= MAX_PARLAY_LEGS;

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : // Silently ignoring a tick past the cap would look broken; the
          // control is disabled instead, so this is only a backstop.
          prev.length >= MAX_PARLAY_LEGS
          ? prev
          : [...prev, id],
    );
  }

  function save() {
    startTransition(async () => {
      const result = await createUserParlayAction(selected);
      if (result?.ok) {
        toast.success(result.message ?? "Parlay saved");
        setSelected([]);
        router.refresh();
      } else if (result) {
        toast.error(result.error);
      }
    });
  }

  if (legs.length === 0) {
    return (
      <div className="card-hairline p-6 text-center">
        <p className="text-sm text-fg-muted">
          Nothing left to build with — every pick on today&apos;s board has already
          kicked off.
        </p>
      </div>
    );
  }

  return (
    <div className="card-hairline overflow-hidden">
      <div className="border-b border-border px-4 py-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <Layers className="size-4 text-brand" aria-hidden="true" />
          Build your own
        </h3>
        <p className="mt-1 text-xs text-fg-subtle">
          Tick {MIN_PARLAY_LEGS} or more of today&apos;s picks. No stake to enter —
          every parlay counts {stake.toFixed(2)}u, and it locks when the first leg
          starts.
        </p>
      </div>

      <ul className="max-h-96 overflow-y-auto overscroll-contain">
        {legs.map((l) => {
          const on = selected.includes(l.id);
          return (
            <li key={l.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                aria-label={`Add to parlay: ${l.selection} at ${formatOdds(l.price)}`}
                disabled={!on && full}
                onClick={() => toggle(l.id)}
                className={cn(
                  "flex w-full items-center gap-3 border-b border-border px-4 py-2.5 text-left transition-colors",
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
                    <span className="text-sm text-fg">{l.selection}</span>
                    <span className="num text-xs text-fg-muted">{formatOdds(l.price)}</span>
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-xs text-fg-subtle">
                    <span className="truncate">{l.event}</span>
                    <span>·</span>
                    <span>{CATEGORY_LABELS[l.category]}</span>
                    <span>·</span>
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

      {/* --------------------------------------------------------- the slip */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface-2/50 px-4 py-3">
        <div className="text-xs">
          <p className="text-fg">
            <span className="num">{selected.length}</span> leg
            {selected.length === 1 ? "" : "s"}
            {price !== null && (
              <>
                {" · "}
                <span className="num font-semibold text-brand">{formatOdds(price)}</span>
              </>
            )}
          </p>
          <p className="mt-0.5 text-fg-subtle">
            {tooFew
              ? `Pick at least ${MIN_PARLAY_LEGS}`
              : returns !== null
                ? `${stake.toFixed(2)}u returns ${returns.toFixed(2)}u`
                : null}
            {full && ` · ${MAX_PARLAY_LEGS}-leg maximum`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {selected.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setSelected([])} disabled={pending}>
              Clear
            </Button>
          )}
          <Button size="sm" onClick={save} disabled={tooFew || pending}>
            {pending ? "Saving…" : "Save parlay"}
          </Button>
        </div>
      </div>
    </div>
  );
}

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
          const result = await deleteUserParlayAction(parlayId);
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
