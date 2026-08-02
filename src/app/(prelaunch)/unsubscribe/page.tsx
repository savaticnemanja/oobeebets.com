import type { Metadata } from "next";
import { UnsubscribeForm } from "@/components/newsletter/unsubscribe-form";

export const metadata: Metadata = {
  title: "Unsubscribe",
  description: "Stop receiving emails from oobee bets.",
  // Nothing to gain from indexing it, and a crawler that follows a tokenised
  // link out of a leaked email should not be able to surface it in results.
  robots: { index: false, follow: false },
};

/**
 * Reached two ways: from the tokenised link in an email footer, or typed in by
 * someone who no longer has the email.
 *
 * The opt-out happens on submit, never on load. Corporate mail scanners and
 * link prefetchers follow every URL in a message with a GET, so unsubscribing
 * on render would quietly remove people who never clicked anything.
 */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <div className="mx-auto max-w-md px-4 py-16 sm:px-6 sm:py-24">
      <div className="card-hairline p-6 sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight">Unsubscribe</h1>
        <UnsubscribeForm token={token} />
      </div>
    </div>
  );
}
