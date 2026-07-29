"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Check, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { subscribeAction, joinWaitlistAction } from "@/app/actions/billing";
import { TIERS, TIER_ORDER, TRIAL_DAYS } from "@/lib/tiers";
import type { Tier } from "@/db/schema";
import { cn, formatMoney } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** A badge pinned to the top edge of a card, overlapping its border. */
const EDGE_BADGE = "absolute -top-2.5 left-6 bg-surface bg-linear-to-b";

export function PricingGrid({
  pricing,
  seatsLeft,
  trialsEnabled,
  currentTier,
  isAuthed,
  hasUsedTrial,
}: {
  pricing: Record<Tier, number>;
  seatsLeft: number;
  trialsEnabled: boolean;
  currentTier: Tier | null;
  isAuthed: boolean;
  hasUsedTrial: boolean;
}) {
  const [state, formAction, pending] = useActionState(subscribeAction, null);
  const soldOut = seatsLeft <= 0;
  const canTrial = trialsEnabled && !hasUsedTrial && !currentTier;

  if (soldOut) return <WaitlistPanel />;

  return (
    <div>
      {state && !state.ok && (
        <p
          role="alert"
          className="mb-4 rounded-lg border border-miss/30 bg-miss-dim px-4 py-3 text-sm text-miss"
        >
          {state.error}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {TIER_ORDER.map((id) => {
          const tier = TIERS[id];
          const isCurrent = currentTier === id;
          // Pro is the intended default: half the board at half the top price.
          const featured = id === "pro";

          return (
            <div
              key={id}
              className={cn(
                "card-hairline relative flex flex-col p-6 transition-all duration-300",
                featured && "border-brand/30 brand-glow",
                isCurrent && "border-hit/40",
              )}
            >
              {/* Both badges straddle the card's top border, so they need an
                  opaque fill or the border draws straight through them. The
                  variants' own fills are translucent — right for a badge
                  sitting inside a card, wrong for one lifted onto its edge.
                  `bg-surface` replaces that fill (tailwind-merge keeps the
                  later background-color) and the flat gradient re-applies the
                  variant's tint on top of it, so the colour is unchanged and
                  only what shows through is. */}
              {featured && !isCurrent && (
                <Badge
                  variant="brand"
                  className={cn(EDGE_BADGE, "from-brand/10 to-brand/10")}
                >
                  <Sparkles className="size-3" aria-hidden="true" />
                  Most popular
                </Badge>
              )}
              {isCurrent && (
                <Badge
                  variant="hit"
                  className={cn(EDGE_BADGE, "from-hit-dim to-hit-dim")}
                >
                  Your plan
                </Badge>
              )}

              {/* h2, not h3: each plan is a section directly under the page's
                  h1, and an h3 here skipped a level. */}
              <h2 className="text-lg font-semibold tracking-tight">{tier.name}</h2>
              <p className="mt-1 text-sm text-fg-muted">{tier.tagline}</p>

              <p className="mt-5 flex items-baseline gap-1.5">
                <span className="num text-4xl font-semibold tracking-tight text-fg">
                  {formatMoney(pricing[id])}
                </span>
                <span className="text-sm text-fg-subtle">/month</span>
              </p>

              <p className="num mt-2 text-sm font-medium text-brand">
                {tier.picksPerDay} picks a day
              </p>

              <ul className="mt-5 flex-1 space-y-2.5">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-fg-muted">
                    <Check className="mt-0.5 size-4 shrink-0 text-hit" aria-hidden="true" />
                    {f}
                  </li>
                ))}
              </ul>

              <div className="mt-6">
                {isCurrent ? (
                  <Button variant="subtle" className="w-full" asChild>
                    <Link href="/account">Manage plan</Link>
                  </Button>
                ) : !isAuthed ? (
                  <Button
                    variant={featured ? "default" : "outline"}
                    className="w-full"
                    asChild
                  >
                    <Link href={`/signup?tier=${id}`}>
                      {canTrial ? `Start ${TRIAL_DAYS}-day trial` : `Get ${tier.name}`}
                    </Link>
                  </Button>
                ) : (
                  <form action={formAction}>
                    <input type="hidden" name="tier" value={id} />
                    <input type="hidden" name="trial" value={canTrial ? "1" : "0"} />
                    <Button
                      type="submit"
                      variant={featured ? "default" : "outline"}
                      className="w-full"
                      disabled={pending}
                    >
                      {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
                      {currentTier
                        ? `Switch to ${tier.name}`
                        : canTrial
                          ? `Start ${TRIAL_DAYS}-day trial`
                          : `Get ${tier.name}`}
                    </Button>
                  </form>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-center text-xs text-fg-subtle">
        {canTrial
          ? `${TRIAL_DAYS} days free, then it renews at the price above. Cancel any time — one trial per account.`
          : "Cancel any time. Your price never rises while you stay subscribed."}
      </p>
    </div>
  );
}

/** Shown instead of every CTA once the seat cap is reached (FR-C2). */
function WaitlistPanel() {
  const [state, formAction, pending] = useActionState(joinWaitlistAction, null);

  return (
    <div className="card-hairline mx-auto max-w-md p-6 text-center">
      <h2 className="text-lg font-semibold tracking-tight">The room is full</h2>
      <p className="mt-2 text-sm text-fg-muted">
        We cap membership on purpose. Leave your email and you get first refusal when
        a seat opens.
      </p>

      {state?.ok ? (
        <p role="status" className="mt-5 rounded-lg border border-hit/30 bg-hit-dim px-4 py-3 text-sm text-hit">
          {state.message}
        </p>
      ) : (
        <form action={formAction} className="mt-5 flex flex-col gap-3 text-left">
          <div>
            <Label htmlFor="waitlist-email">Email</Label>
            <Input
              id="waitlist-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
              className="mt-1.5"
            />
          </div>
          {state && !state.ok && (
            <p role="alert" className="text-sm text-miss">
              {state.error}
            </p>
          )}
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
            Join the waitlist
          </Button>
        </form>
      )}
    </div>
  );
}
