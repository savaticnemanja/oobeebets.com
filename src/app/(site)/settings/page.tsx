import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Shield } from "lucide-react";
import { getAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DocPage, DocSection } from "@/components/doc-page";
import { ChangePasswordForm } from "@/components/password-reset-forms";
import { DeleteAccountForm } from "@/components/delete-account-form";
import { BillingNote, PlanOffer } from "@/components/billing/plan-offer";
import { CancelSubscriptionButton, ManageBillingButton, ResumeSubscriptionButton } from "@/components/billing/plan-controls";
import { viewerAccess } from "@/lib/billing/access";
import { PLAN_PRICE_LABEL } from "@/lib/plan";
import { formatDate } from "@/lib/i18n/format";

export const metadata: Metadata = {
  title: "Settings",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Account settings, from the navigation (below Profile): who you're signed in
 * as, your plan — the subscription is started, cancelled and resumed here
 * (#plan) — your password, and deleting the account (#delete). The public
 * profile is edited on /account ("Edit profile"). Laid out like every other
 * page: the 600px column, and each part a full-width row.
 */
export default async function SettingsPage() {
  const auth = await getAuth();
  if (!auth) redirect("/login?next=/settings");
  const { access, subscription: sub, trialEligible } = await viewerAccess(auth);
  // Test keys (sk_test_…, rk_test_…) mean a sandbox.
  const testMode = process.env.STRIPE_SECRET_KEY?.includes("_test_") ?? false;
  const cancelling = Boolean(sub && (sub.cancelAtPeriodEnd || sub.cancelAt));
  // When it stops (cancelled) or next bills (not): the trial's end on a trial.
  const runsTo = sub ? (cancelling && sub.cancelAt ? sub.cancelAt : (sub.currentPeriodEnd ?? sub.trialEnd)) : null;
  const on = runsTo ? formatDate(runsTo) : "the end of the period";

  return (
    <DocPage title="Settings">
      <DocSection title="Sign-in">
        <p>
          Signed in as <span className="text-fg">{auth.user.email}</span>.
        </p>
        {auth.isAdmin && (
          <div className="flex items-center gap-3">
            <Badge variant="brand">
              <Shield className="size-3" aria-hidden="true" />
              {auth.user.role}
            </Badge>
            <Link href="/admin" className="text-brand hover:underline">
              Open admin panel
            </Link>
          </div>
        )}
      </DocSection>

      <DocSection id="plan" title="Plan">
        {access === null ? (
          <>
            <p>
              {auth.isAdmin
                ? "As an admin you see the whole board — every pick, drafts included. No plan needed."
                : "You have the whole board — every pick, free. No plan needed."}
            </p>
            <Button asChild className="rounded-full">
              <Link href="/picks">See the picks</Link>
            </Button>
          </>
        ) : sub && access === "subscriber" ? (
          <>
            {sub.status === "trialing" ? (
              cancelling ? (
                <p>
                  Your free trial is cancelled. The whole board stays open until{" "}
                  <span className="text-fg">{on}</span>, and you won&apos;t be charged.
                </p>
              ) : (
                <p>
                  You&apos;re on the free trial — the whole board is open. On <span className="text-fg">{on}</span> it
                  becomes {PLAN_PRICE_LABEL}, charged to the card you gave. Cancel before then and you&apos;re never
                  charged.
                </p>
              )
            ) : cancelling ? (
              <p>
                Your subscription is cancelled. The whole board stays open until <span className="text-fg">{on}</span>,
                and nothing more is charged.
              </p>
            ) : (
              <p>
                You&apos;re subscribed — {PLAN_PRICE_LABEL}. The next charge is on{" "}
                <span className="text-fg">{on}</span>. Cancel anytime; you keep the board to the end of what
                you&apos;ve paid for.
              </p>
            )}
            <div className="flex flex-wrap items-start gap-2 pt-1">
              {cancelling ? (
                <ResumeSubscriptionButton />
              ) : (
                <CancelSubscriptionButton
                  consequence={
                    sub.status === "trialing"
                      ? `The board stays open until ${on} and you're never charged.`
                      : `The board stays open until ${on}; nothing more is charged.`
                  }
                />
              )}
              <ManageBillingButton />
            </div>
          </>
        ) : sub ? (
          <>
            <p>
              Your last payment didn&apos;t go through, so the open picks are locked. Update your card and Stripe
              will try again — the board opens the moment it&apos;s paid.
            </p>
            <div className="flex flex-wrap items-start gap-2 pt-1">
              <ManageBillingButton label="Update card" />
              <CancelSubscriptionButton consequence="Nothing more is charged." />
            </div>
          </>
        ) : (
          <p>
            Without a subscription you see every pick once it&apos;s graded, but not the open ones before kick-off.
            {trialEligible ? " Try it free for 14 days:" : ""} {PLAN_PRICE_LABEL}, cancel anytime.
          </p>
        )}
      </DocSection>

      {access !== null && !sub && <PlanOffer trial={trialEligible} testMode={testMode} />}
      {access !== null && sub && <BillingNote testMode={testMode} />}

      <DocSection title="Security">
        <p>
          You&apos;re signed in on this device for 30 days. Signing out revokes the session
          on the server immediately. Changing your password signs out every other device.
        </p>
        <div className="pt-1 text-fg">
          <ChangePasswordForm email={auth.user.email} />
        </div>
      </DocSection>

      <DocSection id="delete" title="Delete account">
        <p>
          Deletes your profile and everything on it — posts, replies, likes, follows, your parlays, the picks
          you marked and your sign-up answers — and signs you out everywhere. It can&apos;t be undone.
          Oobee&apos;s own picks and their results stay on the record; they never held anything about you.
          {sub && " Your subscription ends with it, straight away: nothing more is charged, and time left isn't refunded."}
        </p>
        <div className="pt-1 text-fg">
          <DeleteAccountForm email={auth.user.email} />
        </div>
      </DocSection>
    </DocPage>
  );
}
