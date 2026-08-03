import type { Metadata } from "next";
import { BellOff } from "lucide-react";
import { UnsubscribeForm } from "@/components/newsletter/unsubscribe-form";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Unsubscribe",
  description: `Stop receiving emails from ${SITE.name}.`,
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
 *
 * The page carries the explanation and the form carries only the controls. The
 * two used to say overlapping versions of the same thing, and someone who has
 * already decided to leave should not have to read it twice.
 */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10 sm:px-6 sm:py-14">
      <div className="animate-rise">
        <span className="inline-flex rounded-full border border-border bg-surface p-2.5 text-fg-muted">
          <BellOff className="size-5" aria-hidden="true" />
        </span>

        <h1 className="mt-5 text-2xl font-semibold tracking-tight sm:text-3xl">
          Unsubscribe
        </h1>

        {/* No dark patterns on the way out: the wording is plain, the button is
            one click, and nothing here tries to talk anyone round. */}
        <p className="mt-3 text-sm leading-relaxed text-fg-muted">
          {token
            ? "One click and you're off the pre-launch list. We won't ask you to confirm and we won't email you to check."
            : "Enter the address you signed up with and we'll take it off the pre-launch list. No account or password needed."}
        </p>
      </div>

      <div
        className="animate-rise card-hairline mt-7 p-5 sm:p-6"
        style={{ animationDelay: "80ms" }}
      >
        <UnsubscribeForm token={token} />
      </div>
    </div>
  );
}
