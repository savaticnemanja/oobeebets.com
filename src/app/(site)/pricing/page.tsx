import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Check } from "lucide-react";
import { getAuth } from "@/lib/auth";
import { viewerAccess } from "@/lib/billing/access";
import { billingEnabled } from "@/lib/billing/stripe";
import { DocPage, DocSection } from "@/components/doc-page";
import { ManagePlanButton, PlanButton } from "@/components/billing/plan-button";
import { Badge } from "@/components/ui/badge";
import { ACCESS, TIERS, TIER_ORDER, accessAtLeast, formatPrice } from "@/lib/tiers";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Plans",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The three plans, one row each in the 600px column. With billing off (the
 * free beta) there is nothing to sell, so old links land on the board as
 * they did before.
 */
export default async function PricingPage() {
  if (!billingEnabled()) redirect("/picks");
  const auth = await getAuth();
  if (!auth) redirect("/login?next=/pricing");
  if (auth.isAdmin) redirect("/picks");

  const { access, subscription } = await viewerAccess(auth);
  // Test keys (sk_test_…, rk_test_…) mean a sandbox: say which card works.
  const testMode = process.env.STRIPE_SECRET_KEY?.includes("_test_") ?? false;

  return (
    <DocPage title="Plans" back={{ href: "/picks", label: "Back to picks" }}>
      <DocSection>
        <p>
          Without a plan you see the #{ACCESS.free.picks.game} game bet and the #{ACCESS.free.picks.prop} player
          prop each day. Every plan is monthly and can be cancelled any time from your account.
        </p>
      </DocSection>

      {TIER_ORDER.map((t) => {
        const tier = TIERS[t];
        const current = access === t;
        const label = !subscription
          ? `Get ${tier.name}`
          : current
            ? "Manage plan"
            : `Switch to ${tier.name}`;
        return (
          <section
            key={t}
            id={t}
            className={cn("scroll-mt-20 border-b border-border px-4 py-5", t === "pro" && "bg-surface/40")}
          >
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight">
                {tier.name}
                {t === "pro" && !subscription && <Badge variant="brand">Most popular</Badge>}
                {current && <Badge variant="hit">Your plan</Badge>}
              </h2>
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
            <div className="mt-4 max-w-xs">
              {current ? (
                <ManagePlanButton />
              ) : (
                <PlanButton tier={t} label={label} primary={!access || !accessAtLeast(access, t)} />
              )}
            </div>
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
    </DocPage>
  );
}
