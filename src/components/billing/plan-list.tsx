import { Check } from "lucide-react";
import type { Subscription } from "@/db/schema";
import { PlanButton } from "@/components/billing/plan-button";
import { DocSection } from "@/components/doc-page";
import { Badge } from "@/components/ui/badge";
import { TIERS, TIER_ORDER, accessAtLeast, formatPrice, type Access } from "@/lib/tiers";
import { cn } from "@/lib/utils";

/**
 * The three plans, one full-width row each, under the account page's Plan
 * section. Each row is an anchor (#base, #pro, #elite) — where the board's
 * Unlock rows point. Your own plan is managed from the section above, so its
 * row has no button; the others switch through the customer portal.
 */
export function PlanList({
  access,
  subscription,
  testMode,
}: {
  access: Access;
  subscription: Subscription | null;
  /** A Stripe test key: say which card works. */
  testMode: boolean;
}) {
  return (
    <>
      {TIER_ORDER.map((t) => {
        const tier = TIERS[t];
        const current = access === t;
        return (
          <section
            key={t}
            id={t}
            className={cn("scroll-mt-20 border-b border-border px-4 py-5", t === "pro" && "bg-surface/40")}
          >
            <div className="flex items-baseline justify-between gap-4">
              <h3 className="flex items-center gap-2 text-lg font-bold tracking-tight">
                {tier.name}
                {t === "pro" && !subscription && <Badge variant="brand">Most popular</Badge>}
                {current && <Badge variant="hit">Your plan</Badge>}
              </h3>
              <p className="num text-lg font-semibold">
                {formatPrice(tier.priceCents)}
                <span className="text-sm font-normal text-fg-muted">/mo</span>
              </p>
            </div>
            <p className="mt-1 text-[0.9375rem] text-fg-muted">{tier.tagline}</p>
            <ul className="mt-3 space-y-1.5 text-[0.9375rem]">
              {tier.features.map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <Check className="size-4 shrink-0 text-brand" aria-hidden="true" />
                  {f}
                </li>
              ))}
            </ul>
            {!current && (
              <div className="mt-4 max-w-xs">
                <PlanButton
                  tier={t}
                  label={subscription ? `Switch to ${tier.name}` : `Get ${tier.name}`}
                  primary={!accessAtLeast(access, t)}
                />
              </div>
            )}
          </section>
        );
      })}

      <DocSection>
        <p className="text-sm">
          Payments are handled by Stripe; oobee never sees your card.
          {testMode && (
            <>
              {" "}
              This deployment uses Stripe&apos;s test mode: pay with card 4242 4242 4242 4242, any future date and
              any CVC. Nothing is charged.
            </>
          )}
        </p>
      </DocSection>
    </>
  );
}
