import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Account deleted",
  robots: { index: false, follow: false },
};

/** Where deleteAccountAction lands: signed out, with nothing left to go back to. */
export default function AccountDeletedPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Your account is deleted</h1>
      <p className="mt-2 text-sm text-fg-muted">
        Your profile and everything on it are gone, and you&apos;re signed out everywhere. We&apos;ve
        sent a last email to confirm it. Thanks for testing oobee bets.
      </p>
      <p className="mt-8 text-sm text-fg-muted">
        <Link href="/" className="text-brand hover:underline">
          Back to the home page
        </Link>
      </p>
    </>
  );
}
