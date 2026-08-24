import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuth, hashToken } from "@/lib/auth";
import { isInviteUsable, lookupInvite } from "@/lib/invitations";
import { OnboardingForm } from "@/components/onboarding-form";

export const metadata: Metadata = {
  title: "Accept your invite",
  robots: { index: false, follow: false },
};

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const auth = await getAuth();
  if (auth) redirect("/picks");

  const { token } = await params;
  const invite = await lookupInvite(hashToken(token));

  if (!invite || !isInviteUsable(invite)) {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-tight">
          This invite link isn&apos;t valid anymore
        </h1>
        <p className="mt-2 text-sm text-fg-muted">
          It may have expired, been revoked, or already been used. If that&apos;s a
          mistake, ask whoever invited you to send a new one.
        </p>
        <p className="mt-8 text-sm text-fg-muted">
          Already have an account?{" "}
          <Link href="/login" className="text-brand hover:underline">
            Sign in
          </Link>
        </p>
      </>
    );
  }

  return <OnboardingForm email={invite.email} token={token} />;
}
