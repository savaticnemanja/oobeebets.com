import { Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { pickProfit } from "@/lib/settlement";
import { FollowToggle } from "@/components/follow-toggle";
import type { ViewerFollow } from "@/lib/follows";
import { PICK_STATE, pickBadge, pickState, type PickState } from "@/components/pick-state";
import type { Pick, PickStatus, Sport } from "@/db/schema";
import { formatOdds, formatSignedPct, formatUnits } from "@/lib/i18n/format";
import { LocalTime } from "@/components/local-time";
import { t } from "@/lib/i18n";

// The emoji does not come from the catalogue, because a picture of a ball is
// the same picture in every language.
const SPORT_EMOJI: Record<Sport, string> = {
  soccer: "⚽",
  basketball: "🏀",
  baseball: "⚾",
  tennis: "🎾",
  hockey: "🏒",
  football: "🏈",
};

const STATUS_VARIANT: Record<PickStatus, "hit" | "miss" | "pending" | "default" | "void"> = {
  won: "hit",
  lost: "miss",
  pending: "pending",
  push: "default",
  void: "void",
};

/** Result is never colour-only — the word ships with it. */
const STATUS_LABEL: Record<PickStatus, string> = t().status;

/**
 * The line under a card: when it starts, and once it can't be taken any more,
 * why — "Started … · locked", or the result with the final score. Same icon
 * and colour as the circle beside the selection. Parlay tickets use it too,
 * with `prefix` "First leg".
 */
export function StatusLine({
  at,
  state,
  finalScore,
  taken,
  prefix,
  takenLabel = "You took it",
}: {
  at: Date;
  state: PickState | null;
  finalScore?: string | null;
  taken?: boolean;
  prefix?: string;
  takenLabel?: string;
}) {
  const time = <LocalTime at={at} format="kickoff" className="num" />;
  const lead = prefix ? `${prefix} ` : "";
  if (!state) {
    return (
      <span className="text-xs text-fg-subtle">
        {lead}
        {time}
      </span>
    );
  }
  const s = PICK_STATE[state];
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs", s.color)}>
      <s.icon className="size-3 shrink-0" strokeWidth={2.5} aria-hidden="true" />
      {state === "started" ? (
        <span>
          {prefix ? `${prefix} started` : "Started"} {time} · locked
        </span>
      ) : (
        <>
          <span className="font-medium">{s.label}</span>
          {finalScore && <span className="num">· Final {finalScore}</span>}
          <span className="text-fg-subtle">
            · {lead}
            {time}
          </span>
        </>
      )}
      {taken && <span className="text-brand">· {takenLabel}</span>}
    </span>
  );
}

/**
 * The status icon in the circle's place, for cards with nothing to tap — a
 * parlay ticket. Same slot size as FollowToggle, so headlines line up across
 * picks and parlays; `idle` is what it shows before kick-off.
 */
export function StateMark({
  state,
  idle,
}: {
  state: PickState | null;
  idle: React.ReactNode;
}) {
  const box = "size-9 -ml-1 -mt-1";
  if (!state) return <span className={cn("grid shrink-0 place-items-center", box)}>{idle}</span>;
  const s = PICK_STATE[state];
  return (
    <span className={cn("grid shrink-0 place-items-center", box, s.color)} title={s.label}>
      <s.icon className="size-4" strokeWidth={2.25} aria-hidden="true" />
    </span>
  );
}

/**
 * The star on a featured pick, prop or parlay — next to the league (or the
 * sport icons) in its header. Featured items differ from the rest only by
 * this and a pinch lighter background, and they lead their day.
 */
export function FeaturedMark() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-[0.6875rem] font-semibold text-pending">
      <Star className="size-3 fill-current" aria-hidden="true" />
      Featured
    </span>
  );
}

/* ------------------------------------------------------------------ export */

/**
 * `follow` is the viewer's own "I took this bet" state. Left undefined, the
 * card renders no check circle at all — which is the right answer for an admin
 * previewing an unpublished draft, where there is nothing to take yet.
 *
 * `variant="row"` draws it as a timeline row rather than a boxed card — full
 * width, a hairline underneath, as posts are on Home. The board uses it.
 */
export function PickCard({
  pick,
  featured,
  follow,
  variant = "card",
}: {
  pick: Pick;
  featured?: boolean;
  follow?: ViewerFollow;
  variant?: "card" | "row";
}) {
  const profit = pickProfit(pick);
  const settled = pick.status !== "pending";
  // Rendered per request (the board is force-dynamic), so "now" is fresh.
  // eslint-disable-next-line react-hooks/purity
  const state = pickState(pick, Date.now());
  const badge = pickBadge(state);

  return (
    <article
      className={cn(
        "group relative overflow-hidden",
        variant === "row"
          ? cn(
              "border-b border-border px-4 py-3 transition-colors hover:bg-surface/60",
              // Featured: a pinch lighter, nothing else — same size and type.
              featured && "bg-white/[0.035]",
              // The row's answer to the card's tinted border: a thin bar down
              // the left edge, so a graded day scans as a column of results.
              pick.status === "won" && "shadow-[inset_2px_0_0_var(--color-hit)]",
              pick.status === "lost" && "shadow-[inset_2px_0_0_var(--color-miss)]",
            )
          : cn(
              "card-hairline p-4 transition-all duration-300 hover:border-border-strong",
              featured && "bg-white/[0.035]",
              pick.status === "won" && "border-hit/20",
              pick.status === "lost" && "border-miss/20",
            ),
      )}
      aria-label={`Pick ${pick.rank}: ${pick.selection} at ${formatOdds(pick.price)}, ${badge.label}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span aria-hidden="true">{SPORT_EMOJI[pick.sport]}</span>
          <span className="truncate text-xs text-fg-muted">{pick.league}</span>
          {featured && <FeaturedMark />}
        </div>
        <Badge variant={badge.variant}>
          {badge.live && (
            <span className="size-1.5 rounded-full bg-pending motion-safe:animate-pulse" aria-hidden="true" />
          )}
          {badge.label}
        </Badge>
      </div>

      {/* The check circle sits to the left of the selection, on the same line
          — "○ Jalen Hurts — Over 24.5 Rush Yards". `items-start` rather than
          centred, so a selection long enough to wrap keeps the circle beside
          its first line instead of floating to the middle of two. */}
      <div className="mt-3 flex items-start gap-2.5">
        {follow && (
          <FollowToggle
            pickId={pick.id}
            selection={pick.selection}
            follow={follow}
            state={state}
          />
        )}
        {/* The fixture reads as the selection's subtitle, so it is inside this
            column rather than below the row — at the card's left edge it would
            hang a quarter-inch to the left of the headline it describes. */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <h3 className="text-lg font-semibold tracking-tight text-fg">
              {pick.selection}
            </h3>
            <span className="num text-sm text-fg-muted">
              {formatOdds(pick.price)}
            </span>
            {pick.book && <span className="text-[0.6875rem] text-fg-subtle">{pick.book}</span>}
          </div>

          <p className="mt-1 truncate text-sm text-fg-muted">{pick.event}</p>
        </div>
      </div>

      <dl className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {pick.confidence !== null && (
          <div className="flex items-baseline gap-1">
            <dt className="text-fg-subtle">Confidence</dt>
            <dd className="num font-medium text-brand">{pick.confidence}%</dd>
          </div>
        )}
        {pick.evPct !== null && (
          <div className="flex items-baseline gap-1">
            <dt className="text-fg-subtle">EV</dt>
            {/* The schema allows a negative edge, so the sign is read off the
                value — hardcoding "+" printed "+-3.2%" in green. */}
            <dd
              className={cn(
                "num font-medium",
                Number(pick.evPct) > 0
                  ? "text-hit"
                  : Number(pick.evPct) < 0
                    ? "text-miss"
                    : "text-fg-muted",
              )}
            >
              {formatSignedPct(Number(pick.evPct))}
            </dd>
          </div>
        )}
        <div className="flex items-baseline gap-1">
          <dt className="text-fg-subtle">Stake</dt>
          <dd className="num font-medium text-fg-muted">{Number(pick.units).toFixed(2)}u</dd>
        </div>
        {settled && pick.status !== "void" && (
          <div className="flex items-baseline gap-1">
            <dt className="text-fg-subtle">Result</dt>
            <dd
              className={cn(
                "num font-semibold",
                profit > 0 ? "text-hit" : profit < 0 ? "text-miss" : "text-fg-muted",
              )}
            >
              {formatUnits(profit)}
            </dd>
          </div>
        )}
      </dl>

      {pick.reasoning && (
        <p className="mt-3 border-t border-border pt-3 text-xs leading-relaxed text-fg-muted">
          {pick.reasoning}
        </p>
      )}

      <div className="mt-3 flex items-center justify-between gap-3">
        <StatusLine at={pick.startsAt} state={state} finalScore={pick.finalScore} taken={follow?.taken} />
      </div>
    </article>
  );
}

export { SPORT_EMOJI, STATUS_LABEL, STATUS_VARIANT };
