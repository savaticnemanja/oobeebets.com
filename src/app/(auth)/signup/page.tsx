import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignupForm } from "@/components/auth-form";
import { getAuth } from "@/lib/auth";
import { getSeatUsage, getSettings } from "@/lib/settings";
import { Badge } from "@/components/ui/badge";
import { TRIAL_DAYS } from "@/lib/tiers";

export const metadata: Metadata = {
  title: "Create an account",
  description: "Create your oobee bets account.",
  robots: { index: false, follow: false },
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ tier?: string }>;
}) {
  const auth = await getAuth();
  if (auth) redirect("/picks");

  const [{ left, cap }, settings] = await Promise.all([getSeatUsage(), getSettings()]);
  const { tier } = await searchParams;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {left > 0 ? (
          <Badge variant="brand">
            {left} of {cap} seats left
          </Badge>
        ) : (
          <Badge variant="miss">Waitlist only</Badge>
        )}
        {settings.trialsEnabled && (
          <Badge variant="outline">{TRIAL_DAYS}-day trial</Badge>
        )}
      </div>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Create your account</h1>
      <p className="mt-2 text-sm text-fg-muted">
        Free to make. You pick a plan on the next screen.
      </p>

      <div className="mt-8">
        <SignupForm tier={tier} />
      </div>
    </>
  );
}
