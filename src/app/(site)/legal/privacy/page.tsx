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
    <div className="shell py-16 [&>*]:max-w-2xl">
      <h1 className="text-3xl font-semibold tracking-tight">Privacy policy</h1>
      <p className="mt-2 text-xs uppercase tracking-wider text-pending">
        Draft — must be reviewed by a lawyer before launch
      </p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-fg-muted">
        <section>
          <h2 className="text-base font-semibold text-fg">What we collect</h2>
          <p className="mt-2">
            Your email address and a hashed version of your password. We keep basic
            session records (approximate IP and browser) so you can stay signed in and so
            we can detect abuse. We do not collect any payment information — the beta is
            free.
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
            time. Deleting your account removes your personal data. Anonymised pick and
            result records remain, since they contain nothing personal and form the
            public record.
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
