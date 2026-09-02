import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Closed beta",
  description: "oobee bets is invite-only during the closed beta.",
  robots: { index: false, follow: false },
};

export default async function SignupPage() {
  const auth = await getAuth();
  if (auth) redirect("/picks");

  return (
    <>
      <Badge variant="brand">Closed beta</Badge>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Invite only, for now</h1>
      <p className="mt-2 text-sm text-fg-muted">
        We&apos;re not open for signups yet — accounts are created by invitation
        while we&apos;re in closed beta.
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
