import Link from "next/link";
import { Lock, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { LockedPick, UnlockedPick, ViewPick } from "@/lib/gating";
import { isLocked } from "@/lib/gating";
import { cn, formatOdds, formatUnits } from "@/lib/utils";
import { pickProfit } from "@/lib/settlement";
import { TIERS } from "@/lib/tiers";
import type { PickStatus, Sport } from "@/db/schema";

const SPORT_LABEL: Record<Sport, string> = {
  soccer: "Soccer",
  basketball: "Basketball",
  baseball: "Baseball",
  tennis: "Tennis",
  hockey: "Hockey",
  football: "Football",
};

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
const STATUS_LABEL: Record<PickStatus, string> = {
  won: "Won",
  lost: "Lost",
  pending: "Pending",
  push: "Push",
  void: "Void",
};

function KickoffTime({ at }: { at: Date }) {
  return (
    <time dateTime={at.toISOString()} className="num text-xs text-fg-subtle">
      {at.toLocaleString("en-GB", {
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "UTC",
      })}{" "}
      UTC
    </time>
  );
}

/* ------------------------------------------------------------------ locked */

function LockedCard({ pick }: { pick: LockedPick }) {
  const tier = TIERS[pick.requiredTier];
  return (
    <article
      className="card-hairline relative overflow-hidden p-4"
      aria-label={`Pick ${pick.rank}, locked. Requires ${tier.name}.`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="num rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-[0.6875rem] text-fg-subtle">
            #{pick.rank}
          </span>
          <span aria-hidden="true">{SPORT_EMOJI[pick.sport]}</span>
          <span className="text-xs text-fg-muted">{pick.league}</span>
        </div>
        <Badge variant="outline">
          <Lock className="size-3" aria-hidden="true" />
          {tier.name}
        </Badge>
      </div>

      {/* Placeholder only. The real selection is not in this payload. */}
      <div className="mt-3 select-none" aria-hidden="true">
        <div className="redacted text-lg font-semibold text-fg">Over 000.0 &minus;110</div>
        <div className="redacted mt-1 text-xs text-fg-muted">
          Hidden team vs Hidden team
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <KickoffTime at={pick.startsAt} />
        <Button size="sm" variant="outline" asChild>
          <Link href="/pricing">Unlock with {tier.name}</Link>
        </Button>
      </div>
    </article>
  );
}

/* ---------------------------------------------------------------- unlocked */

function UnlockedCard({ pick, featured }: { pick: UnlockedPick; featured?: boolean }) {
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
            <dd className="num font-medium text-hit">
              +{Number(pick.evPct).toFixed(1)}%
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

/* ------------------------------------------------------------------ export */

export function PickCard({ pick, featured }: { pick: ViewPick; featured?: boolean }) {
  return isLocked(pick) ? (
    <LockedCard pick={pick} />
  ) : (
    <UnlockedCard pick={pick} featured={featured} />
  );
}

/** Hero treatment for rank 1 — the shop window, free to everyone. */
export function TopPickCard({ pick }: { pick: ViewPick }) {
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

export { SPORT_LABEL, SPORT_EMOJI, STATUS_LABEL, STATUS_VARIANT };
