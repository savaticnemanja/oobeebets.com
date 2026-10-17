import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/password-reset-forms";
import { findUsableReset } from "@/lib/password-reset";

export const metadata: Metadata = {
  title: "Choose a new password",
  robots: { index: false, follow: false },
  // The token is in the path: never send it on to another site.
  referrer: "no-referrer",
};

export const dynamic = "force-dynamic";

/**
 * Where the emailed link lands. Works signed in or out — someone resetting
 * from a device that's still signed in is asking for exactly this.
 */
export default async function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const reset = token.length <= 200 ? await findUsableReset(token) : null;

  if (!reset) {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-tight">This link has expired</h1>
        <p className="mt-2 text-sm text-fg-muted">
          Reset links work once, for 60 minutes, and only the newest one you asked for works.
        </p>
        <p className="mt-8 text-sm">
          <Link href="/forgot-password" className="text-brand hover:underline">
            Send a new link
          </Link>
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
      <p className="mt-2 text-sm text-fg-muted">
        For <span className="text-fg">{reset.email}</span>.
      </p>
      <div className="mt-8">
        <ResetPasswordForm token={token} email={reset.email} />
      </div>
    </>
  );
}
