import { Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SPORT_EMOJI } from "@/components/pick-card";
import { LocalTime } from "@/components/local-time";
import { PICK_STATE, pickBadge, pickState, ticketState } from "@/components/pick-state";
import type { ParlayView } from "@/lib/parlay-store";
import { americanToDecimal } from "@/lib/settlement";
import { formatOdds, formatUnits } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";

/**
 * A shared parlay inside a post, wherever the post shows up: a timeline, a
 * repost, above a reply, its own page, the Community tab. It sits where a
 * photo or link card would, so a parlay post reads like every other post —
 * avatar, name, ticket, then the same action row, which carries the Play
 * button (see PostActions).
 *
 * Compact on purpose: a line per leg (two at most on a phone, where the
 * game it's in gives way first), with its result, and the kick-off and
 * payout in a single footer. `detail` shows every leg in full, on the
 * post's own page.
 */
export function ParlayTicket({ parlay, detail = false }: { parlay: ParlayView; detail?: boolean }) {
  const { legs, status, price } = parlay;
  const title = parlay.title ?? `${legs.length}-leg parlay`;
  const decimal = price === null ? null : americanToDecimal(price);
  const dropped = legs.filter((l) => l.status === "push" || l.status === "void").length;

  // Rendered per request on every page that shows tickets, so "now" is fresh.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const starts = legs.map((l) => l.startsAt.getTime());
  const state = ticketState(status, starts, now);
  const badge = pickBadge(state);
  const settled = status !== "pending";
  const mark = state ? PICK_STATE[state] : null;

  return (
    <div
      className={cn(
        "rounded-2xl border border-border",
        status === "won" && "border-hit/30",
        status === "lost" && "border-miss/30",
      )}
      role="group"
      aria-label={`${title} at ${price === null ? "no price" : formatOdds(price)}, ${badge.label}`}
    >
      <div className="flex items-center justify-between gap-2 px-3 pt-2.5">
        <div className="flex min-w-0 items-baseline gap-2">
          <Layers className="size-4 shrink-0 self-center text-brand" aria-hidden="true" />
          <span className="truncate font-semibold text-fg">{title}</span>
          <span className="num shrink-0 text-sm text-fg-muted">{price === null ? "—" : formatOdds(price)}</span>
          {dropped > 0 && <span className="shrink-0 text-xs text-fg-subtle">{dropped} dropped</span>}
        </div>
        <Badge variant={badge.variant} className="shrink-0">
          {badge.live && (
            <span className="size-1.5 rounded-full bg-pending motion-safe:animate-pulse" aria-hidden="true" />
          )}
          {/* The footer says what it's waiting for; up here, one word fits a phone. */}
          {state === "awaiting" ? "Awaiting" : badge.label}
        </Badge>
      </div>

      <ol className="mt-2 space-y-1.5 px-3">
        {legs.map((l) => {
          const legState = pickState(l, now);
          const legMark = legState ? PICK_STATE[legState] : null;
          const off = l.status === "push" || l.status === "void";
          return (
            <li key={l.key} className="flex items-baseline gap-2 text-sm" title={`${l.selection} · ${l.event}`}>
              <span aria-hidden="true" className="w-4 shrink-0 text-center text-xs">
                {SPORT_EMOJI[l.sport]}
              </span>
              <p className={cn("min-w-0 flex-1", !detail && "line-clamp-2")}>
                <span
                  className={cn(
                    "font-medium text-fg",
                    // Struck through, not hidden: a dropped leg still happened,
                    // and it's why the price moved.
                    off && "text-void line-through",
                    l.status === "lost" && "text-miss",
                  )}
                >
                  {l.selection}
                </span>{" "}
                <span className="text-xs text-fg-subtle">· {l.event}</span>
              </p>
              <span className="num shrink-0 text-xs text-fg-muted">{formatOdds(l.price)}</span>
              {/* Its result once it has one; nothing before kick-off. */}
              <span className={cn("grid w-3.5 shrink-0 place-items-center self-start pt-0.5", legMark?.color)}>
                {legMark && <legMark.icon className="size-3.5" strokeWidth={2.5} aria-label={legMark.label} />}
              </span>
            </li>
          );
        })}
      </ol>

      {parlay.reasoning && (
        <p className={cn("mt-2 px-3 text-xs leading-relaxed text-fg-muted", !detail && "line-clamp-2")}>
          {parlay.reasoning}
        </p>
      )}

      {/* The badge names the state; down here, its icon, when it starts, and
          what it pays — short enough to stay on one line on a phone. */}
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border px-3 py-2 text-xs">
        {starts.length > 0 ? (
          <span className={cn("inline-flex items-center gap-1.5", mark ? mark.color : "text-fg-subtle")}>
            {mark && <mark.icon className="size-3 shrink-0" strokeWidth={2.5} aria-hidden="true" />}
            <span>
              First leg <LocalTime at={new Date(Math.min(...starts))} format="kickoff" className="num" />
            </span>
          </span>
        ) : (
          <span />
        )}
        {settled && status !== "void" ? (
          <span
            className={cn(
              "num font-semibold",
              parlay.profit > 0 ? "text-hit" : parlay.profit < 0 ? "text-miss" : "text-fg-muted",
            )}
          >
            {formatUnits(parlay.profit)}
          </span>
        ) : decimal !== null && !settled ? (
          <span className="num text-fg-muted" title={`${parlay.stakeUnits.toFixed(2)}u returns ${(parlay.stakeUnits * decimal).toFixed(2)}u`}>
            {parlay.stakeUnits.toFixed(2)}u → {(parlay.stakeUnits * decimal).toFixed(2)}u
          </span>
        ) : null}
      </div>
    </div>
  );
}
