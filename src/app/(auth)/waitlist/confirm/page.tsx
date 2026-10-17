import type { Metadata } from "next";
import { ConfirmWaitlistForm } from "@/components/confirm-waitlist-form";

export const metadata: Metadata = {
  title: "Confirm your place",
  robots: { index: false, follow: false },
};

/**
 * Where the waitlist's confirmation email lands. Opening it does nothing; the
 * button does (see confirmWaitlistAction) — so a mail scanner that follows
 * every link in an inbox can't confirm an address for someone a bot typed in.
 */
export default async function ConfirmWaitlistPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Confirm your place</h1>
      <p className="mt-2 text-sm text-fg-muted">
        One click and you&apos;re on the oobee bets waitlist. We&apos;ll email you once, the day there&apos;s a
        place for you.
      </p>
      <div className="mt-8">
        <ConfirmWaitlistForm token={token ?? ""} />
      </div>
    </>
  );
}
