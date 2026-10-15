import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Shield } from "lucide-react";
import { getAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DocPage, DocSection } from "@/components/doc-page";
import { ProfileForm } from "@/components/social/profile-form";
import { ManagePlanButton } from "@/components/billing/plan-button";
import { PlanList } from "@/components/billing/plan-list";
import { viewerAccess } from "@/lib/billing/access";
import { TIERS } from "@/lib/tiers";
import { formatDate } from "@/lib/i18n/format";

export const metadata: Metadata = {
  title: "Edit profile",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Your profile, account settings and plan — reached from "Edit profile" on
 * your profile, not from the navigation, as on X, and from the board's Unlock
 * rows (#base, #pro, #elite). Laid out like every other page: the 600px
 * column, and each part a full-width row.
 */
export default async function AccountPage() {
  const auth = await getAuth();
  if (!auth) redirect("/login?next=/account");
  const { access, subscription } = await viewerAccess(auth);

  return (
    <DocPage title="Edit profile" back={{ href: `/u/${auth.user.username}`, label: "Back to your profile" }}>
      <DocSection title="Public profile">
        <p>
          What other testers see on your profile and next to your posts. Your email and
          phone number are never shown.
        </p>
        <div className="pt-1 text-fg">
          <ProfileForm
            displayName={auth.user.displayName ?? ""}
            username={auth.user.username}
            bio={auth.user.bio ?? ""}
          />
        </div>
      </DocSection>

      <DocSection title="Account">
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
            <p>You have the whole board — all 15 picks, free during our beta. No plan needed.</p>
            <Button asChild className="rounded-full">
              <Link href="/picks">See today&apos;s picks</Link>
            </Button>
          </>
        ) : subscription ? (
          <>
            <p>
              You&apos;re on <span className="text-fg">{TIERS[subscription.tier].name}</span>
              {subscription.status === "past_due"
                ? " — your last payment didn't go through. Update your card to keep it."
                : subscription.currentPeriodEnd
                  ? subscription.cancelAtPeriodEnd
                    ? `, ending ${formatDate(subscription.currentPeriodEnd)}. It won't renew.`
                    : `, renewing ${formatDate(subscription.currentPeriodEnd)}.`
                  : "."}
            </p>
            <ManagePlanButton />
          </>
        ) : (
          <p>
            You&apos;re on the free board: the #1 game bet and #1 player prop each day. A plan opens up to all 15
            of each. Every plan is monthly and can be cancelled any time.
          </p>
        )}
      </DocSection>

      {access !== null && (
        <PlanList
          access={access}
          subscription={subscription}
          // Test keys (sk_test_…, rk_test_…) mean a sandbox.
          testMode={process.env.STRIPE_SECRET_KEY?.includes("_test_") ?? false}
        />
      )}

      <DocSection title="Security">
        <p>
          You&apos;re signed in on this device for 30 days. Signing out revokes the session
          on the server immediately.
        </p>
      </DocSection>
    </DocPage>
  );
}
