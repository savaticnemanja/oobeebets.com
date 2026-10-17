import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuth } from "@/lib/auth";
import { signupEnabled } from "@/lib/signup";
import { Badge } from "@/components/ui/badge";
import { GetStartedForm } from "@/components/get-started-form";

export const metadata: Metadata = {
  title: "Sign up",
  description: "Create your oobee bets account, or join the waitlist.",
  robots: { index: false, follow: false },
};

/** SIGNUP_ENABLED is read at run time. */
export const dynamic = "force-dynamic";

export default async function SignupPage() {
  if (await getAuth()) redirect("/home");
  const open = signupEnabled();

  return (
    <>
      {!open && <Badge variant="brand">Waitlist</Badge>}

      <h1 className={open ? "text-2xl font-semibold tracking-tight" : "mt-4 text-2xl font-semibold tracking-tight"}>
        {open ? "Create your account" : "Join the waitlist"}
      </h1>
      <p className="mt-2 text-sm text-fg-muted">
        {open
          ? "Tell us a bit about how you bet, and we'll email a link to choose a password and set up your profile."
          : "We're letting people in a few at a time. Tell us a bit about how you bet and we'll write the day there's a place for you."}
      </p>

      <div className="mt-8">
        <GetStartedForm open={open} source="signup" />
      </div>

      <p className="mt-8 text-sm text-fg-muted">
        Already have an account?{" "}
        <Link href="/login" className="text-brand hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
