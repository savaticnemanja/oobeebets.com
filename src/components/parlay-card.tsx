import { Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { SPORT_EMOJI, STATUS_LABEL, STATUS_VARIANT } from "@/components/pick-card";
import type { ParlayView } from "@/lib/parlay-store";
import { americanToDecimal } from "@/lib/settlement";
import { formatKickoff, formatOdds, formatUnits, timeZoneLabel } from "@/lib/i18n/format";
import { CATEGORY_LABELS } from "@/lib/board";

/**
 * One parlay ticket, legs and all.
 *
 * The same component renders Oobee's published parlays, a tester's own, and
 * the admin inspector's rows — because they are the same object, graded by the
 * same functions before they get here (see lib/parlay-store.ts). A ticket that
 * looked different depending on who built it would be the first place the two
 * could drift apart.
 *
 * Every leg carries its own result, not just the parlay's. On a lost ticket
 * that is the whole story: which leg killed it is the only thing anyone
 * actually wants to know.
 */
export function ParlayCard({
  parlay,
  featured,
  children,
}: {
  parlay: ParlayView;
  featured?: boolean;
  /** Slot for an action — the owner's delete control, say. */
  children?: React.ReactNode;
}) {
  const { legs, status, price } = parlay;
  const settled = status !== "pending";
  const decimal = price === null ? null : americanToDecimal(price);

  // A leg that pushed or voided no longer counts toward the price, and the
  // ticket says so rather than quietly showing different odds than it opened
  // with. See parlayPrice in lib/parlays.ts.
  const dropped = legs.filter((l) => l.status === "push" || l.status === "void").length;

  return (
    <article
      className={cn(
        "card-hairline group relative overflow-hidden p-4 transition-all duration-300",
        "hover:border-border-strong",
        featured && "border-brand/25 bg-brand/5 p-5",
        status === "won" && !featured && "border-hit/20",
        status === "lost" && !featured && "border-miss/20",
      )}
      aria-label={`${legs.length}-leg parlay at ${price === null ? "no price" : formatOdds(price)}, ${STATUS_LABEL[status]}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {parlay.rank !== null && (
            <span className="num rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-[0.6875rem] text-fg-subtle">
              #{parlay.rank}
            </span>
          )}
          <Layers className="size-3.5 text-brand" aria-hidden="true" />
          <span className="text-xs text-fg-muted">
            {legs.length}-leg parlay
            {dropped > 0 && (
              <span className="text-fg-subtle">
                {" "}
                · {dropped} dropped
              </span>
            )}
          </span>
        </div>
        <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>
      </div>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <h3
          className={cn(
            "font-semibold tracking-tight text-fg",
            featured ? "text-2xl" : "text-lg",
          )}
        >
          {parlay.title ?? `${legs.length}-leg parlay`}
        </h3>
        <span className={cn("num text-fg-muted", featured ? "text-lg" : "text-sm")}>
          {price === null ? "—" : formatOdds(price)}
        </span>
        {decimal !== null && (
          <span className="num text-[0.6875rem] text-fg-subtle">
            {parlay.stakeUnits.toFixed(2)}u returns{" "}
            {(parlay.stakeUnits * decimal).toFixed(2)}u
          </span>
        )}
      </div>

      {/* ------------------------------------------------------------- legs */}
      <ol className="mt-3 space-y-1.5 border-l border-border pl-3">
        {legs.map((l) => (
          <li key={l.pickId} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
            <span aria-hidden="true" className="text-xs">
              {SPORT_EMOJI[l.sport]}
            </span>
            <span
              className={cn(
                "text-fg",
                // Struck through, not hidden: a dropped leg still happened and
                // the ticket should show why the price moved.
                (l.status === "push" || l.status === "void") && "text-void line-through",
                l.status === "lost" && "text-miss",
              )}
            >
              {l.selection}
            </span>
            <span className="num text-xs text-fg-muted">{formatOdds(l.price)}</span>
            <span className="truncate text-xs text-fg-subtle">{l.event}</span>
            <span
              className={cn(
                "ml-auto text-[0.6875rem]",
                l.status === "won"
                  ? "text-hit"
                  : l.status === "lost"
                    ? "text-miss"
                    : l.status === "pending"
                      ? "text-pending"
                      : "text-fg-subtle",
              )}
            >
              {STATUS_LABEL[l.status]}
            </span>
          </li>
        ))}
      </ol>

      <dl className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {parlay.confidence !== null && (
          <div className="flex items-baseline gap-1">
            <dt className="text-fg-subtle">Confidence</dt>
            <dd className="num font-medium text-brand">{parlay.confidence}%</dd>
          </div>
        )}
        <div className="flex items-baseline gap-1">
          <dt className="text-fg-subtle">Stake</dt>
          <dd className="num font-medium text-fg-muted">
            {parlay.stakeUnits.toFixed(2)}u
          </dd>
        </div>
        {settled && status !== "void" && (
          <div className="flex items-baseline gap-1">
            <dt className="text-fg-subtle">Result</dt>
            <dd
              className={cn(
                "num font-semibold",
                parlay.profit > 0
                  ? "text-hit"
                  : parlay.profit < 0
                    ? "text-miss"
                    : "text-fg-muted",
              )}
            >
              {formatUnits(parlay.profit)}
            </dd>
          </div>
        )}
        {parlay.book && <span className="text-[0.6875rem] text-fg-subtle">{parlay.book}</span>}
      </dl>

      {parlay.reasoning && (
        <p className="mt-3 border-t border-border pt-3 text-xs leading-relaxed text-fg-muted">
          {parlay.reasoning}
        </p>
      )}

      {(children || legs.length > 0) && (
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="num text-xs text-fg-subtle">
            {legs.length > 0 && (
              <>
                First leg {formatKickoff(legs[0].startsAt)} {timeZoneLabel()}
              </>
            )}
          </span>
          {children}
        </div>
      )}
    </article>
  );
}

/** Compact one-liner for tables — the admin inspector's rows. */
export function ParlayLegList({ legs }: { legs: ParlayView["legs"] }) {
  return (
    <ol className="space-y-0.5">
      {legs.map((l) => (
        <li key={l.pickId} className="flex items-baseline gap-2 text-xs">
          <span
            className={cn(
              "text-fg",
              (l.status === "push" || l.status === "void") && "text-void line-through",
              l.status === "lost" && "text-miss",
              l.status === "won" && "text-hit",
            )}
          >
            {l.selection}
          </span>
          <span className="num text-fg-subtle">{formatOdds(l.price)}</span>
          <span className="truncate text-fg-subtle">{CATEGORY_LABELS[l.category]}</span>
        </li>
      ))}
    </ol>
  );
}
