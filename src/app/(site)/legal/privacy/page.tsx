import type { Metadata } from "next";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: `Privacy policy for ${SITE.name}.`,
  alternates: { canonical: "/legal/privacy" },
};

/** Placeholder — replace with counsel-reviewed copy before launch (FSD O6). */
export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Privacy policy</h1>
      <p className="mt-2 text-xs uppercase tracking-wider text-pending">
        Draft — must be reviewed by a lawyer before launch
      </p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-fg-muted">
        <section>
          <h2 className="text-base font-semibold text-fg">What we collect</h2>
          <p className="mt-2">
            Your email address, a hashed version of your password, and your subscription
            status. We keep basic session records (approximate IP and browser) so you can
            stay signed in and so we can detect abuse.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-fg">Payment data</h2>
          <p className="mt-2">
            We never see or store card details. Payments are handled entirely by our
            payment processor; we hold only the customer and subscription identifiers
            they give us.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-fg">What we don&apos;t do</h2>
          <p className="mt-2">
            We do not sell your data, we do not share it with advertisers, and we do not
            run third-party tracking or advertising pixels on this site.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-fg">Your rights</h2>
          <p className="mt-2">
            You can request a copy of your data or ask us to delete your account at any
            time. Deleting your account removes your personal data and cancels any active
            subscription. Anonymised pick and result records remain, since they contain
            nothing personal and form the public track record.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-fg">Contact</h2>
          <p className="mt-2">
            Email us at privacy@{SITE.domain} for anything on this page.
          </p>
        </section>
      </div>
    </div>
  );
}
