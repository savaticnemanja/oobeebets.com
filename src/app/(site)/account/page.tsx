import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, CreditCard, Shield } from "lucide-react";
import { getAuth } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { StatTile } from "@/components/stat-tile";
import { SubscriptionControls } from "@/components/subscription-controls";
import { TIERS } from "@/lib/tiers";
import { formatDate, formatMoney } from "@/lib/i18n/format";

export const metadata: Metadata = {
  title: "Account",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const auth = await getAuth();
  if (!auth) redirect("/login?next=/account");

  const settings = await getSettings();
  const sub = auth.subscription;
  const tier = sub ? TIERS[sub.tier] : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Account</h1>
      <p className="mt-1.5 text-sm text-fg-muted">{auth.user.email}</p>

      {auth.isAdmin && (
        <div className="mt-4 flex items-center gap-2">
          <Badge variant="brand">
            <Shield className="size-3" aria-hidden="true" />
            {auth.user.role}
          </Badge>
          <Button variant="link" asChild>
            <Link href="/admin">Open admin panel</Link>
          </Button>
        </div>
      )}

      {/* --------------------------------------------------- past due notice */}
      {sub?.status === "past_due" && (
        <div
          role="alert"
          className="mt-6 flex items-start gap-3 rounded-lg border border-pending/30 bg-pending-dim px-4 py-3 text-sm text-pending"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            Your last payment didn&apos;t go through. We&apos;re retrying — update your
            card to avoid losing access.
          </span>
        </div>
      )}

      {/* ------------------------------------------------------ subscription */}
      <Card className="mt-8">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Subscription</CardTitle>
              <CardDescription>
                {tier ? tier.tagline : "You're on the free view — Top Pick of the Day only."}
              </CardDescription>
            </div>
            {sub ? (
              <Badge variant={sub.status === "trialing" ? "pending" : "hit"}>
                {sub.status === "trialing" ? "Trial" : sub.status}
              </Badge>
            ) : (
              <Badge variant="outline">No plan</Badge>
            )}
          </div>
        </CardHeader>

        <CardContent>
          {sub && tier ? (
            <>
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <StatTile label="Plan" value={tier.name} tone="brand" />
                <StatTile label="Picks a day" value={tier.picksPerDay} />
                <StatTile
                  label="Your price"
                  value={sub.priceCents === 0 ? "Comped" : formatMoney(sub.priceCents)}
                  sub="Locked while you stay subscribed"
                />
              </dl>

              <p className="mt-4 text-sm text-fg-muted">
                {sub.cancelAtPeriodEnd ? (
                  <>
                    Cancelled — access ends{" "}
                    <span className="num text-fg">
                      {formatDate(sub.currentPeriodEnd)}
                    </span>
                    .
                  </>
                ) : sub.status === "trialing" ? (
                  <>
                    Trial converts to {formatMoney(sub.priceCents)} on{" "}
                    <span className="num text-fg">
                      {formatDate(sub.currentPeriodEnd)}
                    </span>
                    .
                  </>
                ) : (
                  <>
                    Renews{" "}
                    <span className="num text-fg">
                      {formatDate(sub.currentPeriodEnd)}
                    </span>
                    .
                  </>
                )}
              </p>

              {/* Price protection is the whole reason to join early — say it. */}
              {sub.priceCents > 0 && settings.pricing[sub.tier] > sub.priceCents && (
                <p className="mt-3 rounded-lg border border-hit/25 bg-hit-dim px-3 py-2 text-xs text-hit">
                  The price for new members is now {formatMoney(settings.pricing[sub.tier])}
                  . You keep {formatMoney(sub.priceCents)} for as long as you stay.
                </p>
              )}

              <div className="mt-6">
                <SubscriptionControls
                  currentTier={sub.tier}
                  cancelAtPeriodEnd={sub.cancelAtPeriodEnd}
                  pricing={settings.pricing}
                />
              </div>
            </>
          ) : (
            <div className="text-center">
              <CreditCard className="mx-auto size-8 text-fg-subtle" aria-hidden="true" />
              <p className="mt-3 text-sm text-fg-muted">
                Pick a plan to unlock the board.
              </p>
              <Button className="mt-4" asChild>
                <Link href="/pricing">See the plans</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* -------------------------------------------------------------- misc */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Security</CardTitle>
          <CardDescription>
            You&apos;re signed in on this device for 30 days. Signing out revokes the
            session on the server immediately.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
