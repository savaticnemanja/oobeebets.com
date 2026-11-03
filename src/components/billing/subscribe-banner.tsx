import { Lock } from "lucide-react";
import { SubscribeButton } from "@/components/billing/subscribe-button";
import { PLAN, PLAN_PRICE_LABEL } from "@/lib/plan";

/**
 * The top of the board for anyone without a subscription: a big brand-blue
 * band saying the open picks are for subscribers, with the way in. Settled
 * picks still list below it — the record is open to everyone.
 */
export function SubscribeBanner({
  trial,
  paymentFailed = false,
}: {
  /** They'd get the free trial. */
  trial: boolean;
  /** They have a subscription whose renewal didn't go through: the button opens Stripe to fix the card. */
  paymentFailed?: boolean;
}) {
  return (
    <section
      aria-labelledby="subscribe-banner-heading"
      className="border-b border-brand-dim bg-brand px-4 py-6 text-black sm:px-6 sm:py-7"
    >
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-black/70">
        <Lock className="size-3.5" aria-hidden="true" />
        Subscribers only
      </p>
      <h2 id="subscribe-banner-heading" className="mt-2 text-2xl font-bold tracking-tight sm:text-[1.75rem]">
        {paymentFailed ? "Update your card to see today's picks" : "Subscribe to see today's picks"}
      </h2>
      <p className="mt-2 max-w-md text-[0.9375rem] text-black/80">
        {paymentFailed
          ? "Your last payment didn't go through, so the open picks are locked. They open again the moment it's paid."
          : `Every game bet, player prop and parlay, before kick-off. ${
              trial ? `${PLAN.trialDays} days free, then ${PLAN_PRICE_LABEL}.` : `${PLAN_PRICE_LABEL}.`
            } Cancel anytime.`}{" "}
        Below: settled picks only.
      </p>
      <div className="mt-5 max-w-xs">
        <SubscribeButton
          from="picks"
          size="lg"
          // A subscription that exists already is sent to Stripe's portal by the action.
          label={paymentFailed ? "Update card" : trial ? `Start ${PLAN.trialDays}-day free trial` : "Subscribe"}
          className="bg-black text-white hover:bg-black/85 hover:shadow-none"
          errorClassName="font-medium text-black"
        />
      </div>
    </section>
  );
}
