import Link from "next/link";
import { Layers } from "lucide-react";
import { Avatar, TeamBadge, displayNameOf } from "@/components/social/identity";
import { LocalTime } from "@/components/local-time";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { FeaturedMark, SPORT_EMOJI, StateMark, StatusLine } from "@/components/pick-card";
import { FollowToggle } from "@/components/follow-toggle";
import type { ViewerFollow } from "@/lib/follows";
import { PICK_STATE, pickBadge, pickState, ticketState } from "@/components/pick-state";
import type { ParlayView } from "@/lib/parlay-store";
import type { Role } from "@/db/schema";
import { americanToDecimal } from "@/lib/settlement";
import { formatOdds, formatUnits } from "@/lib/i18n/format";
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
  className,
  variant = "card",
  owner,
  kicker,
  follow,
  children,
}: {
  parlay: ParlayView;
  featured?: boolean;
  className?: string;
  /** "row": a full-width timeline row with a hairline under it, as on Home. */
  variant?: "card" | "row";
  /**
   * A tester's ticket: who built it and when, in the header. Shared ones
   * are posts and draw as one (social/parlay-ticket.tsx); this is for the
   * rare shared ticket with no post behind it.
   */
  owner?: { username: string; displayName: string | null; role?: Role };
  /** A line above the header — where a ticket on Stats came from. */
  kicker?: React.ReactNode;
  /** The viewer can play (tail) this ticket: its circle, as on a pick. */
  follow?: ViewerFollow;
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

  // Upcoming until the first leg kicks off, Live from then until graded — the
  // same badges as a single pick (see pick-state.ts), and per leg below.
  // Rendered per request on every page that shows tickets, so "now" is fresh.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const starts = legs.map((l) => l.startsAt.getTime());
  const firstStart = starts.length ? Math.min(...starts) : Infinity;
  const state = ticketState(status, starts, now);
  const badge = pickBadge(state);
  // The sports on the ticket, once each, where a pick shows its one sport.
  const sports = [...new Set(legs.map((l) => l.sport))];

  // Laid out as a pick card is (pick-card.tsx), so the two read as one board:
  // the same header, a status mark where the pick's circle sits, the headline
  // with its price, the stats row, the reasoning, the status line.
  return (
    <article
      className={cn(
        "group relative overflow-hidden",
        variant === "row"
          ? cn(
              "border-b border-border px-4 py-3 transition-colors hover:bg-surface/60",
              featured && "bg-white/[0.035]",
              status === "won" && "shadow-[inset_2px_0_0_var(--color-hit)]",
              status === "lost" && "shadow-[inset_2px_0_0_var(--color-miss)]",
            )
          : cn(
              "card-hairline p-4 transition-all duration-300 hover:border-border-strong",
              featured && "bg-white/[0.035]",
              status === "won" && "border-hit/20",
              status === "lost" && "border-miss/20",
            ),
        className,
      )}
      aria-label={`${legs.length}-leg parlay at ${price === null ? "no price" : formatOdds(price)}, ${badge.label}`}
    >
      {kicker}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {owner && (
            <Link
              href={`/u/${owner.username}`}
              className="flex min-w-0 items-center gap-2 text-xs hover:underline"
            >
              <Avatar name={displayNameOf(owner)} size="sm" className="size-6 text-[0.625rem]" />
              <span className="truncate font-semibold text-fg">{displayNameOf(owner)}</span>
              {owner.role && <TeamBadge role={owner.role} />}
              <span className="truncate text-fg-subtle">@{owner.username}</span>
            </Link>
          )}
          {owner &&
            (() => {
              const time = (
                <>
                  · <LocalTime at={parlay.createdAt} format="ago" />
                </>
              );
              return <span className="shrink-0 text-xs text-fg-subtle">{time}</span>;
            })()}
          <span aria-hidden="true">{sports.map((sp) => SPORT_EMOJI[sp]).join("")}</span>
          {/* A tester's ticket is titled "N-leg parlay" already, so with the
              owner taking the room the count isn't repeated up here. */}
          {(!owner || dropped > 0) && (
            <span className="truncate text-xs text-fg-muted">
              {!owner && `${legs.length}-leg parlay`}
              {dropped > 0 && <span className="text-fg-subtle">{owner ? "" : " · "}{dropped} dropped</span>}
            </span>
          )}
          {featured && <FeaturedMark />}
        </div>
        <Badge variant={badge.variant}>
          {badge.live && (
            <span className="size-1.5 rounded-full bg-pending motion-safe:animate-pulse" aria-hidden="true" />
          )}
          {badge.label}
        </Badge>
      </div>

      <div className="mt-3 flex items-start gap-2.5">
        {/* "I played this" where the viewer can tail it, as a pick's circle;
            otherwise the ticket's status mark. */}
        {follow ? (
          <FollowToggle
            kind="parlay"
            pickId={parlay.id}
            selection={parlay.title ?? `${legs.length}-leg parlay`}
            follow={follow}
            state={state}
          />
        ) : (
          <StateMark
            state={state}
            idle={<Layers className="size-4 text-brand" aria-hidden="true" />}
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <h3 className="text-lg font-semibold tracking-tight text-fg">
              {parlay.title ?? `${legs.length}-leg parlay`}
            </h3>
            <span className="num text-sm text-fg-muted">
              {price === null ? "—" : formatOdds(price)}
            </span>
            {parlay.book && <span className="text-[0.6875rem] text-fg-subtle">{parlay.book}</span>}
          </div>
          {decimal !== null && (
            <p className="num mt-1 text-sm text-fg-muted">
              {parlay.stakeUnits.toFixed(2)}u returns {(parlay.stakeUnits * decimal).toFixed(2)}u
            </p>
          )}

          {/* ----------------------------------------------------------- legs */}
          <ol className="mt-3 space-y-2">
            {legs.map((l) => {
              const legState = pickState(l, now);
              const legBadge = pickBadge(legState);
              const LegIcon = legState ? PICK_STATE[legState].icon : null;
              return (
                <li key={l.key} className="flex items-start gap-2 text-sm">
                  <span aria-hidden="true" className="text-xs leading-5">
                    {SPORT_EMOJI[l.sport]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span
                        className={cn(
                          "font-medium text-fg",
                          // Struck through, not hidden: a dropped leg still happened and
                          // the ticket should show why the price moved.
                          (l.status === "push" || l.status === "void") && "text-void line-through",
                          l.status === "lost" && "text-miss",
                        )}
                      >
                        {l.selection}
                      </span>
                      <span className="num text-xs text-fg-muted">{formatOdds(l.price)}</span>
                    </div>
                    <p className="truncate text-xs text-fg-subtle">{l.event}</p>
                  </div>
                  <span
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1 text-[0.6875rem] leading-5",
                      legState ? PICK_STATE[legState].color : "text-fg-subtle",
                    )}
                  >
                    {LegIcon && <LegIcon className="size-3" strokeWidth={2.5} aria-hidden="true" />}
                    {legBadge.label}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      <dl className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {parlay.confidence !== null && (
          <div className="flex items-baseline gap-1">
            <dt className="text-fg-subtle">Confidence</dt>
            <dd className="num font-medium text-brand">{parlay.confidence}%</dd>
          </div>
        )}
        <div className="flex items-baseline gap-1">
          <dt className="text-fg-subtle">Stake</dt>
          <dd className="num font-medium text-fg-muted">{parlay.stakeUnits.toFixed(2)}u</dd>
        </div>
        {settled && status !== "void" && (
          <div className="flex items-baseline gap-1">
            <dt className="text-fg-subtle">Result</dt>
            <dd
              className={cn(
                "num font-semibold",
                parlay.profit > 0 ? "text-hit" : parlay.profit < 0 ? "text-miss" : "text-fg-muted",
              )}
            >
              {formatUnits(parlay.profit)}
            </dd>
          </div>
        )}
      </dl>

      {parlay.reasoning && (
        <p className="mt-3 border-t border-border pt-3 text-xs leading-relaxed text-fg-muted">
          {parlay.reasoning}
        </p>
      )}

      {(children || legs.length > 0) && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          {legs.length > 0 ? (
            <StatusLine
              at={new Date(firstStart)}
              state={state}
              prefix="First leg"
              taken={follow?.taken ?? parlay.played}
              takenLabel="You played it"
            />
          ) : (
            <span />
          )}
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
        <li key={l.key} className="flex items-baseline gap-2 text-xs">
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
