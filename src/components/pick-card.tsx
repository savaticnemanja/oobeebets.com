import { TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { pickProfit } from "@/lib/settlement";
import type { Pick, PickStatus, Sport } from "@/db/schema";
import {
  formatKickoff,
  formatOdds,
  formatSignedPct,
  formatUnits,
  timeZoneLabel,
} from "@/lib/i18n/format";
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

function KickoffTime({ at }: { at: Date }) {
  return (
    <time dateTime={at.toISOString()} className="num text-xs text-fg-subtle">
      {formatKickoff(at)} {timeZoneLabel()}
    </time>
  );
}

/* ------------------------------------------------------------------ export */

export function PickCard({ pick, featured }: { pick: Pick; featured?: boolean }) {
  const profit = pickProfit(pick);
  const settled = pick.status !== "pending";

  return (
    <article
      className={cn(
        "card-hairline group relative overflow-hidden p-4 transition-all duration-300",
        "hover:border-border-strong",
        featured && "border-hit/25 bg-hit-dim/30 p-5",
        pick.status === "won" && !featured && "border-hit/20",
        pick.status === "lost" && !featured && "border-miss/20",
      )}
      aria-label={`Pick ${pick.rank}: ${pick.selection} at ${formatOdds(pick.price)}, ${STATUS_LABEL[pick.status]}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="num rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-[0.6875rem] text-fg-subtle">
            #{pick.rank}
          </span>
          <span aria-hidden="true">{SPORT_EMOJI[pick.sport]}</span>
          <span className="truncate text-xs text-fg-muted">{pick.league}</span>
        </div>
        <Badge variant={STATUS_VARIANT[pick.status]}>{STATUS_LABEL[pick.status]}</Badge>
      </div>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <h3
          className={cn(
            "font-semibold tracking-tight text-fg",
            featured ? "text-2xl" : "text-lg",
          )}
        >
          {pick.selection}
        </h3>
        <span className={cn("num text-fg-muted", featured ? "text-lg" : "text-sm")}>
          {formatOdds(pick.price)}
        </span>
        {pick.book && <span className="text-[0.6875rem] text-fg-subtle">{pick.book}</span>}
      </div>

      <p className="mt-1 truncate text-sm text-fg-muted">{pick.event}</p>

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
        <KickoffTime at={pick.startsAt} />
        {pick.finalScore && (
          <span className="num text-xs text-fg-subtle">Final {pick.finalScore}</span>
        )}
      </div>
    </article>
  );
}

/** Hero treatment for rank 1 — the shop window, free to everyone. */
export function TopPickCard({ pick }: { pick: Pick }) {
  return (
    <section aria-labelledby="potd-heading" className="relative">
      <div className="mb-3 flex items-center gap-2">
        <TrendingUp className="size-4 text-hit" aria-hidden="true" />
        <h2
          id="potd-heading"
          className="text-[0.6875rem] font-semibold uppercase tracking-[0.2em] text-hit"
        >
          Top pick of the day
        </h2>
      </div>
      <PickCard pick={pick} featured />
    </section>
  );
}

export { SPORT_EMOJI, STATUS_LABEL, STATUS_VARIANT };
