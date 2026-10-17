"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Layers, X } from "lucide-react";
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
import { formatOdds } from "@/lib/i18n/format";
import { LocalTime } from "@/components/local-time";
import { PARLAYS_PER_SLATE } from "@/lib/board";
import { LinePicker } from "@/components/odds/line-picker";
import { FeedNotice } from "@/components/admin/pick-composer";
import { baseMarket, type GameOption, type LineOption } from "@/lib/odds/markets";
import type { FeedStatus } from "@/lib/odds/sync";

interface Leg {
  option: LineOption;
  game: GameOption;
}

/** One bet on a game: a side of a market, or one player's prop. */
function betKey(option: LineOption, game: GameOption): string {
  return `${game.id}|${baseMarket(option.marketKey)}|${option.player ?? ""}`;
}

/**
 * Where Oobee builds a parlay for its own board tab.
 *
 * Legs come straight off the odds feed — any line on any of the day's games,
 * game lines and props alike — without putting them on the game or prop
 * board first. Then the things only a published recommendation carries: a
 * stake, a confidence, an edge, the reasoning, and — the one that matters —
 * the price the book is actually offering.
 *
 * That price field is why this is not just the tester's builder with a save
 * button. Correlated legs price worse than the product of their parts, so a
 * same-game three-leg the maths calls +600 might be +480 at the book. Left
 * blank the legs decide; filled in, Oobee's number wins until a leg drops out.
 * See parlayPrice in lib/parlays.ts. Same-game legs are allowed for that
 * reason; two lines on one bet (both sides, two numbers on one prop) swap.
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
  const [legs, setLegs] = useState<Leg[]>([]);
  const router = useRouter();

  // Clearing the slip is a render-phase adjustment, not an effect: React's
  // "store information from previous renders" pattern.
  //
  // It only clears on success. A rejected submit keeps the legs so the admin
  // can fix the price and resend — except a leg whose price moved, which
  // comes off so the refreshed feed can offer it at the new price.
  const [handled, setHandled] = useState(state);
  if (state !== handled) {
    setHandled(state);
    if (state?.ok) setLegs([]);
    const moved = state && !state.ok ? state.fieldErrors?.moved : undefined;
    if (moved) setLegs((cur) => cur.filter((l) => !moved.includes(l.option.lineId)));
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

  const derived = combineOdds(legs.map((l) => l.option.price));
  const tooFew = legs.length < MIN_PARLAY_LEGS;
  const boardFull = parlayCount >= PARLAYS_PER_SLATE;

  function toggle(option: LineOption, game: GameOption) {
    setLegs((current) => {
      if (current.some((l) => l.option.lineId === option.lineId)) {
        return current.filter((l) => l.option.lineId !== option.lineId);
      }
      // Another line on the same bet swaps in, as a sportsbook slip does.
      const without = current.filter((l) => betKey(l.option, l.game) !== betKey(option, game));
      if (without.length >= MAX_PARLAY_LEGS) {
        toast.error(`A parlay tops out at ${MAX_PARLAY_LEGS} legs.`);
        return current;
      }
      return [...without, { option, game }];
    });
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
          {parlayCount}/{PARLAYS_PER_SLATE} today. Any line on any of this day&apos;s games —
          game lines or player props — no need to put them on the board first. It goes
          out when the slate is published.
        </p>
      </div>

      {/* ------------------------------------------------------------- feed */}
      <div className="border-b border-border p-5 pt-3">
        <FeedNotice feed={feed} />
        <div className="max-h-[60vh] overflow-y-auto pr-1">
          <LinePicker
            games={games}
            show={{ lines: true, props: true }}
            onPick={toggle}
            isSelected={(id) => legs.some((l) => l.option.lineId === id)}
          />
        </div>
      </div>

      {/* ------------------------------------------------------------- slip */}
      {legs.length > 0 && (
        <ol className="space-y-2 border-b border-border p-5">
          {legs.map((l) => (
            <li key={l.option.lineId} className="flex items-start gap-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="text-fg">{l.option.label}</p>
                <p className="truncate text-xs text-fg-subtle">
                  {l.game.awayTeam} vs {l.game.homeTeam} ·{" "}
                  <LocalTime at={l.game.commenceTime} format="kickoff" className="num" /> · {l.option.bookTitle}
                </p>
              </div>
              <span className="num shrink-0 text-xs text-fg-muted">{formatOdds(l.option.price)}</span>
              <button
                type="button"
                onClick={() => toggle(l.option, l.game)}
                aria-label={`Remove ${l.option.label}`}
                className="grid size-6 shrink-0 place-items-center rounded-full text-fg-subtle hover:bg-surface-2 hover:text-fg"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ol>
      )}

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
