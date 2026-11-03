import { Check } from "lucide-react";
import { SubscribeButton } from "@/components/billing/subscribe-button";
import { DocSection } from "@/components/doc-page";
import { PLAN, PLAN_PRICE_LABEL, formatPrice } from "@/lib/plan";

/**
 * The subscription, one full-width row under the account page's Plan
 * section, for someone who doesn't have one running.
 */
export function PlanOffer({
  trial,
  testMode,
}: {
  /** They'd get the free trial. */
  trial: boolean;
  /** A Stripe test key: say which card works. */
  testMode: boolean;
}) {
  return (
    <>
      <section id="subscribe" className="scroll-mt-20 border-b border-border bg-surface/40 px-4 py-5">
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="text-lg font-bold tracking-tight">{PLAN.short}</h3>
          <p className="num text-lg font-semibold">
            {formatPrice(PLAN.priceCents)}
            <span className="text-sm font-normal text-fg-muted"> / {PLAN.intervalWeeks} weeks</span>
          </p>
        </div>
        <p className="mt-1 text-[0.9375rem] text-fg-muted">
          {trial
            ? `${PLAN.trialDays} days free, then ${PLAN_PRICE_LABEL}. Cancel anytime — cancel during the trial and you're never charged.`
            : `${PLAN_PRICE_LABEL}, starting today. Cancel anytime.`}
        </p>
        <ul className="mt-3 space-y-1.5 text-[0.9375rem]">
          {PLAN.features.map((f) => (
            <li key={f} className="flex items-center gap-2">
              <Check className="size-4 shrink-0 text-brand" aria-hidden="true" />
              {f}
            </li>
          ))}
        </ul>
        <div className="mt-4 max-w-xs">
          <SubscribeButton from="account" label={trial ? `Start ${PLAN.trialDays}-day free trial` : `Subscribe — ${PLAN_PRICE_LABEL}`} />
        </div>
      </section>

      <BillingNote testMode={testMode} />
    </>
  );
}

export function BillingNote({ testMode }: { testMode: boolean }) {
  return (
    <DocSection>
      <p className="text-sm">
        Payments are handled by Stripe; oobee never sees your card.
        {testMode && (
          <>
            {" "}
            This deployment uses Stripe&apos;s test mode: use card 4242 4242 4242 4242, any future date and any
            CVC. Nothing is charged.
          </>
        )}
      </p>
    </DocSection>
  );
}
