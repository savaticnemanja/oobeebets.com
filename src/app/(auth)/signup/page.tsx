import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignupForm } from "@/components/auth-form";
import { getAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Create an account",
  description: "Create your oobee bets account.",
  robots: { index: false, follow: false },
};

export default async function SignupPage() {
  const auth = await getAuth();
  if (auth) redirect("/picks");

  return (
    <>
      <Badge variant="brand">Beta — free for testers</Badge>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Create your account</h1>
      <p className="mt-2 text-sm text-fg-muted">
        Free to make. You&apos;ll have the top 15 picks, unlocked, right away.
      </p>

      <div className="mt-8">
        <SignupForm />
      </div>
    </>
  );
}
