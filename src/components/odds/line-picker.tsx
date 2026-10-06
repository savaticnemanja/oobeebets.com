"use client";

import * as React from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { loadGamePropsAction } from "@/app/actions/odds";
import type { GameOption, LineOption, PropGroup } from "@/lib/odds/markets";
import { formatKickoff, formatOdds, timeZoneLabel } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";

/**
 * The odds feed laid out the way a sportsbook does it, for choosing a bet:
 *
 *                     Spread        Moneyline     Total
 *   Dallas Cowboys    +3.5  -110    +145          O 47.5  -108
 *   Kansas City       -3.5  -110    -170          U 47.5  -112
 *   ▸ Player props
 *
 * Every price is a button; nothing here can be typed. Each one is the best
 * price on the consensus line (see lib/odds/board.ts), and its book is in the
 * button's label. Used by the admin pick composer and by the community
 * parlay builder, which differ only in what a click does.
 */

export interface PickerProps {
  games: GameOption[];
  /** Which markets to offer: game lines, player props, or both. */
  show: { lines: boolean; props: boolean };
  onPick: (option: LineOption, game: GameOption) => void;
  isSelected: (lineId: string) => boolean;
  /** A whole game can be greyed out (the slip already has a leg from it). */
  isGameBlocked?: (gameId: string) => boolean;
}

export function LinePicker({ games, show, onPick, isSelected, isGameBlocked }: PickerProps) {
  if (games.length === 0) {
    return (
      <p className="card-hairline px-4 py-8 text-center text-sm text-fg-muted">
        No games left to bet on this day — everything has started, or the books
        haven&apos;t posted lines yet.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {games.map((g) => (
        <GameCard
          key={g.id}
          game={g}
          show={show}
          onPick={onPick}
          isSelected={isSelected}
          blocked={isGameBlocked?.(g.id) ?? false}
        />
      ))}
    </div>
  );
}

function GameCard({
  game,
  show,
  onPick,
  isSelected,
  blocked,
}: {
  game: GameOption;
  show: PickerProps["show"];
  onPick: PickerProps["onPick"];
  isSelected: PickerProps["isSelected"];
  blocked: boolean;
}) {
  const [propsOpen, setPropsOpen] = React.useState(false);
  const pick = (o: LineOption) => onPick(o, game);

  return (
    <section className={cn("card-hairline overflow-hidden", blocked && "opacity-60")} aria-label={`${game.awayTeam} at ${game.homeTeam}`}>
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 text-xs text-fg-subtle">
        <span className="font-medium text-fg-muted">{game.league}</span>
        <span className="num">
          {formatKickoff(game.commenceTime)} {timeZoneLabel()}
        </span>
      </div>

      {show.lines && (
        <div className="px-3 py-2">
          <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,3.75rem)] sm:grid-cols-[minmax(0,1fr)_repeat(3,4.5rem)] items-center gap-1.5 text-[0.6875rem] uppercase tracking-wider text-fg-subtle">
            <span />
            <span className="text-center">Spread</span>
            <span className="text-center">Money</span>
            <span className="text-center">Total</span>
          </div>
          {(["away", "home"] as const).map((side) => (
            <div
              key={side}
              className="mt-1.5 grid grid-cols-[minmax(0,1fr)_repeat(3,3.75rem)] sm:grid-cols-[minmax(0,1fr)_repeat(3,4.5rem)] items-center gap-1.5"
            >
              <span className="text-sm leading-tight text-fg">
                {side === "away" ? game.awayTeam : game.homeTeam}
              </span>
              <PriceButton
                option={game.spread[side]}
                top={game.spread[side]?.point !== null && game.spread[side] ? signed(game.spread[side]!.point!) : ""}
                onPick={pick}
                isSelected={isSelected}
                disabled={blocked}
              />
              <PriceButton option={game.moneyline[side]} top="" onPick={pick} isSelected={isSelected} disabled={blocked} />
              <PriceButton
                option={side === "away" ? game.total.over : game.total.under}
                top={(() => {
                  const o = side === "away" ? game.total.over : game.total.under;
                  return o ? `${side === "away" ? "O" : "U"} ${o.point}` : "";
                })()}
                onPick={pick}
                isSelected={isSelected}
                disabled={blocked}
              />
            </div>
          ))}
        </div>
      )}

      {show.props && (
        <>
          <button
            type="button"
            onClick={() => setPropsOpen((o) => !o)}
            aria-expanded={propsOpen}
            className="flex w-full items-center gap-1.5 border-t border-border px-3 py-2 text-left text-sm text-brand transition-colors hover:bg-surface-2"
          >
            <ChevronDown className={cn("size-4 transition-transform", propsOpen && "rotate-180")} aria-hidden="true" />
            Player props
          </button>
          {propsOpen && (
            <PropsPanel gameId={game.id} onPick={pick} isSelected={isSelected} disabled={blocked} />
          )}
        </>
      )}
    </section>
  );
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

function PriceButton({
  option,
  top,
  onPick,
  isSelected,
  disabled,
}: {
  option: LineOption | null;
  top: string;
  onPick: (o: LineOption) => void;
  isSelected: (lineId: string) => boolean;
  disabled?: boolean;
}) {
  if (!option) {
    return (
      <span className="grid h-11 place-items-center rounded-lg border border-dashed border-border text-xs text-fg-subtle">
        —
      </span>
    );
  }
  const on = isSelected(option.lineId);
  return (
    <button
      type="button"
      onClick={() => onPick(option)}
      disabled={disabled && !on}
      aria-pressed={on}
      aria-label={`${option.label} ${formatOdds(option.price)} at ${option.bookTitle}`}
      title={`${formatOdds(option.price)} at ${option.bookTitle}`}
      className={cn(
        "flex h-11 flex-col items-center justify-center rounded-lg border text-xs leading-tight transition-colors",
        on
          ? "border-brand bg-brand/15 text-brand"
          : "border-border bg-surface-2 text-fg hover:border-brand/50",
        "disabled:cursor-not-allowed",
      )}
    >
      {top && <span className="num text-fg-muted">{top}</span>}
      <span className="num font-semibold">{formatOdds(option.price)}</span>
    </button>
  );
}

function PropsPanel({
  gameId,
  onPick,
  isSelected,
  disabled,
}: {
  gameId: string;
  onPick: (o: LineOption) => void;
  isSelected: (lineId: string) => boolean;
  disabled: boolean;
}) {
  const [groups, setGroups] = React.useState<PropGroup[] | null>(null);
  const [market, setMarket] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    loadGamePropsAction(gameId)
      .then((g) => {
        if (!cancelled) {
          setGroups(g);
          setMarket(g[0]?.marketKey ?? null);
        }
      })
      .catch(() => !cancelled && setGroups([]));
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  if (groups === null) {
    return (
      <p className="flex items-center gap-2 border-t border-border px-3 py-3 text-xs text-fg-subtle">
        <Loader2 className="size-3 animate-spin" aria-hidden="true" /> Loading props…
      </p>
    );
  }
  if (groups.length === 0) {
    return (
      <p className="border-t border-border px-3 py-3 text-xs text-fg-subtle">
        No player props posted for this game yet.
      </p>
    );
  }
  const group = groups.find((g) => g.marketKey === market) ?? groups[0];

  return (
    <div className="border-t border-border px-3 pb-3 pt-2">
      <div className="-mx-1 flex gap-1 overflow-x-auto pb-2" role="tablist" aria-label="Prop market">
        {groups.map((g) => (
          <button
            key={g.marketKey}
            type="button"
            role="tab"
            aria-selected={g.marketKey === group.marketKey}
            onClick={() => setMarket(g.marketKey)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1 text-xs transition-colors",
              g.marketKey === group.marketKey
                ? "border-brand/50 bg-brand/10 text-brand"
                : "border-border text-fg-muted hover:text-fg",
            )}
          >
            {g.label}
          </button>
        ))}
      </div>
      <div className="max-h-80 space-y-1.5 overflow-y-auto">
        {group.rows.map((r) => (
          <div
            key={r.player}
            className="grid grid-cols-[minmax(0,1fr)_repeat(2,3.75rem)] sm:grid-cols-[minmax(0,1fr)_repeat(2,4.5rem)] items-center gap-1.5"
          >
            <span className="text-sm leading-tight text-fg">{r.player}</span>
            {r.yes ? (
              <>
                <PriceButton option={r.yes} top="Yes" onPick={onPick} isSelected={isSelected} disabled={disabled} />
                <span />
              </>
            ) : (
              <>
                <PriceButton option={r.over} top={r.over ? `O ${r.over.point}` : ""} onPick={onPick} isSelected={isSelected} disabled={disabled} />
                <PriceButton option={r.under} top={r.under ? `U ${r.under.point}` : ""} onPick={onPick} isSelected={isSelected} disabled={disabled} />
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
