import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Check } from "lucide-react";
import { getAuth } from "@/lib/auth";
import { viewerAccess } from "@/lib/billing/access";
import { SubscribeButton } from "@/components/billing/subscribe-button";
import { PLAN, PLAN_PRICE_LABEL, formatPrice } from "@/lib/plan";
import { formatDate } from "@/lib/i18n/format";

export const metadata: Metadata = {
  title: "Start your free trial",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The last step of signing up, straight after the account is made: the
 * subscription, with its free trial — card in at Stripe, nothing charged
 * today. Skippable: "Skip for now" goes on to Home, where the board shows
 * settled picks only until they subscribe (from the banner on Picks, or
 * Settings).
 *
 * Anyone it doesn't apply to — admins, a deployment with billing off,
 * someone already subscribed — goes straight on.
 */
export default async function WelcomePage() {
  const auth = await getAuth();
  if (!auth) redirect("/login?next=/welcome");
  const { access, subscription, trialEligible } = await viewerAccess(auth);
  if (access !== "free" || subscription) redirect("/home?welcome=1");

  // What Checkout will say too: the first charge, 14 days from today.
  const today = new Date();
  const firstCharge = formatDate(new Date(today.getTime() + PLAN.trialDays * DAY_MS));

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-brand">Last step</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">
        {trialEligible ? `Start your ${PLAN.trialDays}-day free trial` : "Subscribe to see every pick"}
      </h1>
      <p className="mt-2 text-sm text-fg-muted">
        {trialEligible
          ? `Every pick on the board, before kick-off. ${PLAN.trialDays} days free, then ${PLAN_PRICE_LABEL}. Cancel anytime.`
          : `Every pick on the board, before kick-off, for ${PLAN_PRICE_LABEL}. Cancel anytime.`}
      </p>

      <ul className="mt-5 space-y-2 text-sm">
        {PLAN.features.map((f) => (
          <li key={f} className="flex items-center gap-2">
            <Check className="size-4 shrink-0 text-brand" aria-hidden="true" />
            {f}
          </li>
        ))}
      </ul>

      <div className="mt-6">
        <SubscribeButton
          from="signup"
          size="lg"
          label={trialEligible ? `Start ${PLAN.trialDays}-day free trial` : `Subscribe — ${PLAN_PRICE_LABEL}`}
        />
      </div>
      <p className="mt-3 text-xs text-fg-subtle">
        {trialEligible
          ? `Stripe takes your card; nothing is charged today. The first ${formatPrice(PLAN.priceCents)} is on ${firstCharge} unless you cancel before then — one click in Settings.`
          : "Stripe takes your card. Cancel anytime in Settings; you keep the board to the end of what you've paid for."}
      </p>

      <div className="mt-8 border-t border-border pt-5 text-center">
        <Link href="/home?welcome=1" className="text-sm font-medium text-fg-muted hover:text-fg hover:underline">
          Skip for now
        </Link>
        <p className="mt-1 text-xs text-fg-subtle">You&apos;ll see settled picks only. Subscribe anytime from Picks.</p>
      </div>
    </div>
  );
}
