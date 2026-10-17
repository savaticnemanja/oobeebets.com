import type { Metadata } from "next";
import { BellOff } from "lucide-react";
import { UnsubscribeForm } from "@/components/unsubscribe-form";
import { issueFormToken } from "@/lib/spam-guard";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Unsubscribe",
  description: `Leave the ${SITE.name} waitlist and newsletter.`,
  // Nothing to gain from indexing it, and a crawler that follows a tokenised
  // link out of a leaked email should not be able to surface it in results.
  robots: { index: false, follow: false },
};

/**
 * The one place every unsubscribe link lands — the waitlist's emails, the old
 * launch-list emails (lib/waitlist.ts unsubscribeByToken takes both tokens) —
 * or reached by someone who no longer has the email, who is mailed a link.
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
    <div className="mx-auto w-full max-w-md px-4 pb-16 pt-12 sm:px-6 sm:pt-20">
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
            ? "One click and you're off the waitlist and the newsletter. We won't ask you to confirm and we won't email you to check."
            : "Enter the address you signed up with and we'll email it a link — one click there and you're off the waitlist and the newsletter."}
        </p>
      </div>

      <div
        className="animate-rise card-hairline mt-7 p-5 sm:p-6"
        style={{ animationDelay: "80ms" }}
      >
        <UnsubscribeForm token={token} formToken={issueFormToken()} />
      </div>
    </div>
  );
}
