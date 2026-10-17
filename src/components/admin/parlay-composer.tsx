"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Layers, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createOobeeParlayAction } from "@/app/actions/parlays";
import {
  MAX_PARLAY_LEGS,
  MIN_PARLAY_LEGS,
} from "@/lib/parlays";
import { americanToDecimal, combineOdds } from "@/lib/settlement";
import { formatOdds } from "@/lib/i18n/format";
import { LocalTime } from "@/components/local-time";
import { PARLAYS_PER_SLATE } from "@/lib/board";
import { LinePicker } from "@/components/odds/line-picker";
import { FeedNotice } from "@/components/admin/pick-composer";
import { baseMarket, type GameOption, type LineOption } from "@/lib/odds/markets";
import type { FeedStatus } from "@/lib/odds/sync";
import { cn } from "@/lib/utils";

interface Leg {
  option: LineOption;
  game: GameOption;
}

/** One bet on a game: a side of a market, or one player's prop. */
function betKey(option: LineOption, game: GameOption): string {
  return `${game.id}|${baseMarket(option.marketKey)}|${option.player ?? ""}`;
}

const EMPTY_SLIP: Array<Leg | null> = [null, null];

/**
 * Where Oobee builds a parlay for its own board tab.
 *
 *   Leg 1  [ Bhayshul Tuten Over 74.5 Rushing Yards   +135 ]
 *   Leg 2  [ + Choose a line                              ]
 *          [ + Add leg ]
 *   Parlay odds · stake · confidence · EV · book · reasoning
 *
 * Each leg is chosen from the odds feed — any line on any of the day's games,
 * game lines or player props (alternate lines too) — without putting it on the
 * game or prop board first. Then the things only a published recommendation
 * carries, and the one that matters most: the parlay odds the book is actually
 * offering.
 *
 * That odds field is why this is not just the tester's builder with a save
 * button. Correlated legs price worse than the product of their parts, so a
 * same-game three-leg the maths calls +600 might be +480 at the book. Left
 * blank the legs decide; filled in, Oobee's number wins until a leg drops out.
 * See parlayPrice in lib/parlays.ts. Same-game legs are allowed for that
 * reason; two lines on one bet (both sides, two numbers on one prop) are not.
 */
export function ParlayComposer({
  date,
  games,
  feed,
  parlayCount,
  disabled,
}: {
  date: string;
  games: GameOption[];
  feed: FeedStatus;
  parlayCount: number;
  disabled: boolean;
}) {
  const [state, formAction, pending] = useActionState(createOobeeParlayAction, null);
  const [slots, setSlots] = useState<Array<Leg | null>>(EMPTY_SLIP);
  // Which slot the line picker is filling, if it's open.
  const [picking, setPicking] = useState<number | null>(null);
  const [view, setView] = useState<"lines" | "props">("lines");
  const router = useRouter();

  // Clearing the slip is a render-phase adjustment, not an effect: React's
  // "store information from previous renders" pattern.
  //
  // It only clears on success. A rejected submit keeps the legs so the admin
  // can fix the odds and resend — except a leg whose price moved, which is
  // emptied so the refreshed feed can offer it at the new price.
  const [handled, setHandled] = useState(state);
  if (state !== handled) {
    setHandled(state);
    if (state?.ok) setSlots(EMPTY_SLIP);
    const moved = state && !state.ok ? state.fieldErrors?.moved : undefined;
    if (moved) setSlots((cur) => cur.map((l) => (l && moved.includes(l.option.lineId) ? null : l)));
  }

  // The toast is a genuine effect: sonner is an external system being told
  // about a state change, which is what effects are for. A moved price also
  // refetches the page, so the feed shows the new number.
  useEffect(() => {
    if (state?.ok) toast.success(state.message ?? "Parlay added");
    else if (state && !state.ok) {
      toast.error(state.error);
      if (state.fieldErrors?.moved) router.refresh();
    }
  }, [state, router]);

  const legs = slots.filter((l): l is Leg => l !== null);
  const derived = combineOdds(legs.map((l) => l.option.price));
  const tooFew = legs.length < MIN_PARLAY_LEGS;
  const boardFull = parlayCount >= PARLAYS_PER_SLATE;

  function choose(option: LineOption, game: GameOption) {
    if (picking === null) return;
    const clash = slots.findIndex((l, i) => i !== picking && l && betKey(l.option, l.game) === betKey(option, game));
    if (clash >= 0) {
      toast.error(`That bet is already Leg ${clash + 1}.`);
      return;
    }
    setSlots((cur) => cur.map((l, i) => (i === picking ? { option, game } : l)));
    setPicking(null);
  }

  // The first two slots are the parlay's minimum and stay put (emptied, not
  // removed); any slot added after them goes away entirely.
  function remove(index: number) {
    setSlots((cur) => (cur.length > MIN_PARLAY_LEGS ? cur.filter((_, i) => i !== index) : cur.map((l, i) => (i === index ? null : l))));
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
          Parlay board is full — {PARLAYS_PER_SLATE} is the limit per game day. Remove one
          to add another.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="card-hairline overflow-hidden">
      <input type="hidden" name="slateDate" value={date} />
      {legs.map((l) => (
        <input key={l.option.lineId} type="hidden" name="leg" value={`${l.option.lineId}:${l.option.price}`} />
      ))}

      <div className="border-b border-border p-5 pb-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <Layers className="size-4 text-brand" aria-hidden="true" />
          Build a parlay
        </h2>
        <p className="mt-1 text-xs text-fg-subtle">
          {parlayCount}/{PARLAYS_PER_SLATE} today. Each leg can be any line on this day&apos;s
          games — game lines or player props. It goes out when the slate is published.
        </p>
      </div>

      {/* ------------------------------------------------------------- legs */}
      <div className="space-y-3 border-b border-border p-5">
        <FeedNotice feed={feed} />
        {slots.map((l, i) => (
          <div key={i}>
            <p className="mb-1 text-[0.6875rem] font-medium uppercase tracking-wider text-fg-subtle">Leg {i + 1}</p>
            {l ? (
              <div className="flex items-start gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2">
                <button
                  type="button"
                  onClick={() => setPicking(i)}
                  className="min-w-0 flex-1 text-left"
                  aria-label={`Change leg ${i + 1}: ${l.option.label}`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-sm text-fg">{l.option.label}</span>
                    <span className="num shrink-0 text-xs font-semibold text-fg">{formatOdds(l.option.price)}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-fg-subtle">
                    {l.game.awayTeam} vs {l.game.homeTeam} ·{" "}
                    <LocalTime at={l.game.commenceTime} format="kickoff" className="num" /> · {l.option.bookTitle}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  aria-label={`Remove leg ${i + 1}`}
                  className="grid size-6 shrink-0 place-items-center rounded-full text-fg-subtle hover:bg-surface-3 hover:text-fg"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPicking(i)}
                  className="flex h-11 flex-1 items-center gap-2 rounded-xl border border-dashed border-border px-3 text-sm text-fg-muted transition-colors hover:border-brand/50 hover:text-fg"
                >
                  <Plus className="size-4" aria-hidden="true" />
                  Choose a line
                </button>
                {slots.length > MIN_PARLAY_LEGS && (
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    aria-label={`Remove leg ${i + 1}`}
                    className="grid size-6 shrink-0 place-items-center rounded-full text-fg-subtle hover:bg-surface-3 hover:text-fg"
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
            )}
          </div>
        ))}

        {slots.length < MAX_PARLAY_LEGS && (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => {
              setSlots((cur) => [...cur, null]);
              setPicking(slots.length);
            }}
          >
            <Plus aria-hidden="true" />
            Add leg
          </Button>
        )}
      </div>

      <Dialog open={picking !== null} onOpenChange={(o) => !o && setPicking(null)}>
        <DialogContent className="max-w-2xl bg-surface">
          <DialogHeader>
            <DialogTitle>Leg {(picking ?? 0) + 1}</DialogTitle>
            <DialogDescription>Any line on this day&apos;s games. Tap a price to use it.</DialogDescription>
          </DialogHeader>
          <div className="mb-3 inline-flex rounded-full border border-border p-0.5" role="tablist" aria-label="Line type">
            {(
              [
                ["lines", "Game lines"],
                ["props", "Player props"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={view === key}
                onClick={() => setView(key)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs transition-colors",
                  view === key ? "bg-brand/15 text-brand" : "text-fg-muted hover:text-fg",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <LinePicker
            games={games}
            show={{ lines: view === "lines", props: view === "props" }}
            onPick={choose}
            isSelected={(id) => slots.some((l) => l?.option.lineId === id)}
          />
        </DialogContent>
      </Dialog>

      {/* ----------------------------------------------------------- details */}
      <div className="space-y-4 p-5">
        <p className="text-xs">
          <span className="num text-fg">{legs.length}</span>
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
            <Label htmlFor="parlay-price">Parlay odds</Label>
            <Input
              id="parlay-price"
              name="price"
              inputMode="numeric"
              placeholder={derived !== null ? String(derived) : "+600"}
            />
            <p className="mt-1 text-[0.6875rem] text-fg-subtle">
              The book&apos;s price, e.g. +450. Blank uses the legs combined.
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
              : `Add ${legs.length}-leg parlay`}
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
