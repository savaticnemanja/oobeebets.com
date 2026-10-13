import type { Metadata } from "next";
import { SITE } from "@/lib/site";
import { DocPage, DocSection } from "@/components/doc-page";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: `Privacy policy for ${SITE.name}.`,
  alternates: { canonical: "/legal/privacy" },
};

/** Placeholder — replace with counsel-reviewed copy before launch (FSD O6). */
export default function PrivacyPage() {
  return (
    <DocPage
      title="Privacy policy"
      kicker={
        <p className="mt-1 text-xs uppercase tracking-wider text-pending">
          Draft — must be reviewed by a lawyer before launch
        </p>
      }
    >
      <DocSection title="What we collect">
        <p>
          Your email address and a hashed version of your password. We keep basic
          session records (approximate IP and browser) so you can stay signed in and so
          we can detect abuse. We do not collect any payment information — the beta is
          free.
        </p>
      </DocSection>

      <DocSection title="What we don't do">
        <p>
          We do not sell your data, we do not share it with advertisers, and we do not
          run third-party tracking or advertising pixels on this site.
        </p>
      </DocSection>

      <DocSection title="Your rights">
        <p>
          You can request a copy of your data or ask us to delete your account at any
          time. Deleting your account removes your personal data. Anonymised pick and
          result records remain, since they contain nothing personal and form the
          public record.
        </p>
      </DocSection>

      <DocSection title="Contact">
        <p>
          Email us at privacy@{SITE.domain} for anything on this page.
        </p>
      </DocSection>
    </DocPage>
  );
}
