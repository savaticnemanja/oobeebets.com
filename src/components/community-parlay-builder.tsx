"use client";

import * as React from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Layers, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { createCommunityParlayAction, setParlaySharedAction } from "@/app/actions/parlays";
import { LinePicker } from "@/components/odds/line-picker";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/misc";
import type { GameOption, LineOption } from "@/lib/odds/markets";
import { MAX_PARLAY_LEGS, MIN_PARLAY_LEGS, PARLAY_STAKE_UNITS } from "@/lib/parlays";
import { combineOdds, americanToDecimal } from "@/lib/settlement";
import { formatOdds } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";

interface Leg {
  option: LineOption;
  game: GameOption;
}

/**
 * Build a parlay from anything in the odds feed — game lines and player props
 * on every game that has not started.
 *
 * The slip prices the ticket as legs are added, with the same combineOdds the
 * server grades with, so what it shows is what the ticket will say. One leg
 * per game: the books price same-game legs together, below the product of
 * their odds, and a naive same-game price would promise a payout nobody pays.
 */
export function CommunityParlayBuilder({ games }: { games: GameOption[] }) {
  const [legs, setLegs] = React.useState<Leg[]>([]);
  const [shared, setShared] = React.useState(true);
  const [pending, startTransition] = useTransition();
  const router = useRouter();


  function toggle(option: LineOption, game: GameOption) {
    setLegs((current) => {
      if (current.some((l) => l.option.lineId === option.lineId)) {
        return current.filter((l) => l.option.lineId !== option.lineId);
      }
      // Tapping another line on a game already in the slip swaps it in,
      // which is what a sportsbook slip does too.
      const without = current.filter((l) => l.game.id !== game.id);
      if (without.length >= MAX_PARLAY_LEGS) {
        toast.error(`A parlay tops out at ${MAX_PARLAY_LEGS} legs.`);
        return current;
      }
      return [...without, { option, game }];
    });
  }

  function save() {
    startTransition(async () => {
      const result = await createCommunityParlayAction(
        legs.map((l) => ({ lineId: l.option.lineId, price: l.option.price })),
        shared,
      );
      if (result.ok) {
        toast.success(result.message);
        setLegs([]);
        router.refresh();
      } else {
        toast.error(result.error);
        if (result.movedLineId) {
          setLegs((cur) => cur.filter((l) => l.option.lineId !== result.movedLineId));
          router.refresh();
        }
      }
    });
  }

  const price = combineOdds(legs.map((l) => l.option.price));
  const stake = Number(PARLAY_STAKE_UNITS);
  const toWin = price === null ? null : stake * (americanToDecimal(price) - 1);
  const tooFew = legs.length < MIN_PARLAY_LEGS;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div>
        <p className="mb-3 text-xs text-fg-subtle">
          Every game still to start today. Tap a price to add it; tap another line on
          the same game to swap. Best price across DraftKings, FanDuel, BetMGM and
          Caesars, on the line most books are hanging.
        </p>
        <LinePicker
          games={games}
          show={{ lines: true, props: true }}
          onPick={toggle}
          isSelected={(id) => legs.some((l) => l.option.lineId === id)}
        />
      </div>

      {/* On a phone the slip sits below every game; this bar keeps the
          ticket in view and jumps to it. */}
      {legs.length > 0 && (
        <a
          href="#parlay-slip"
          className="fixed inset-x-4 bottom-[calc(1rem+var(--spacing-safe-bottom))] z-30 flex items-center justify-between rounded-full bg-brand px-5 py-3 text-sm font-semibold text-black shadow-lg lg:hidden"
        >
          <span>
            Slip · {legs.length} leg{legs.length === 1 ? "" : "s"}
          </span>
          <span className="num">{price === null || tooFew ? `Add ${MIN_PARLAY_LEGS - legs.length} more` : formatOdds(price)}</span>
        </a>
      )}

      <aside
        id="parlay-slip"
        aria-label="Parlay slip"
        className="card-hairline h-fit scroll-mt-20 p-4 lg:sticky lg:top-[calc(4.5rem+var(--spacing-safe-top))]"
      >
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Layers className="size-4 text-brand" aria-hidden="true" />
          Your slip
          <span className="num ml-auto text-xs font-normal text-fg-subtle">
            {legs.length}/{MAX_PARLAY_LEGS}
          </span>
        </h3>

        {legs.length === 0 ? (
          <p className="mt-3 text-sm text-fg-muted">
            Pick at least {MIN_PARLAY_LEGS} legs from different games.
          </p>
        ) : (
          <ol className="mt-3 space-y-2">
            {legs.map((l) => (
              <li key={l.option.lineId} className="flex items-start gap-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="text-fg">{l.option.label}</p>
                  <p className="truncate text-xs text-fg-subtle">
                    {l.game.awayTeam} vs {l.game.homeTeam} · {l.option.bookTitle}
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

        <dl className="mt-4 space-y-1 border-t border-border pt-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-fg-muted">Parlay price</dt>
            <dd className={cn("num font-semibold", price === null || tooFew ? "text-fg-subtle" : "text-brand")}>
              {price === null || tooFew ? "—" : formatOdds(price)}
            </dd>
          </div>
          <div className="flex justify-between text-xs">
            <dt className="text-fg-subtle">{stake.toFixed(2)}u to win</dt>
            <dd className="num text-fg-muted">{toWin === null || tooFew ? "—" : `${toWin.toFixed(2)}u`}</dd>
          </div>
        </dl>

        <label className="mt-4 flex items-center justify-between gap-3 text-sm">
          <span>
            Share to Community
            <span className="block text-xs text-fg-subtle">
              {shared ? "Everyone sees it, with your handle." : "Only you see it, on My bets."}
            </span>
          </span>
          <Switch checked={shared} onCheckedChange={setShared} aria-label="Share to Community" />
        </label>

        <Button className="mt-4 w-full" onClick={save} disabled={tooFew || pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
          Save parlay
        </Button>
        {legs.length > 0 && (
          <p className="mt-2 text-center text-[0.6875rem] text-fg-subtle">
            Prices lock when you save. If one moved, we&apos;ll tell you first.
          </p>
        )}
      </aside>
    </div>
  );
}

/** The owner's share/unshare switch on one of their own tickets. */
export function ShareToggle({ parlayId, shared }: { parlayId: string; shared: boolean }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-xs text-fg-muted">
      <Switch
        checked={shared}
        disabled={pending}
        aria-label="Shared to Community"
        onCheckedChange={(next) =>
          startTransition(async () => {
            const result = await setParlaySharedAction(parlayId, next);
            if (result?.ok) {
              toast.success(result.message ?? "Saved");
              router.refresh();
            } else if (result) {
              toast.error(result.error);
            }
          })
        }
      />
      {shared ? "Shared" : "Private"}
    </label>
  );
}
