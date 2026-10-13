import type { Metadata } from "next";
import { SITE } from "@/lib/site";
import { DocPage, DocSection } from "@/components/doc-page";

export const metadata: Metadata = {
  title: "Terms of service",
  description: `Terms of service for ${SITE.name}.`,
  alternates: { canonical: "/legal/terms" },
};

/**
 * Placeholder. This is not legal advice and must be replaced by counsel before
 * taking payments — see FSD open question O6 (legal entity + jurisdiction).
 */
export default function TermsPage() {
  return (
    <DocPage
      title="Terms of service"
      kicker={
        <p className="mt-1 text-xs uppercase tracking-wider text-pending">
          Draft — must be reviewed by a lawyer before launch
        </p>
      }
    >
      <DocSection title="1. What we sell">
        <p>
          {SITE.name}{" "}
          sells access to sports betting information and analysis. We are not a
          bookmaker, sportsbook, exchange, or financial adviser. We do not accept
          wagers, hold customer funds, or place bets on anyone&apos;s behalf.
        </p>
      </DocSection>

      <DocSection title="2. No guarantee">
        <p>
          Picks are opinion. They lose regularly and are published with that
          expectation. Nothing on this site is a guarantee, a prediction of a certain
          outcome, or a promise of profit. Past performance does not indicate future
          results. You are solely responsible for every bet you place and for any
          money you lose.
        </p>
      </DocSection>

      <DocSection title="3. Eligibility">
        <p>
          You must be at least 18 years old, or the legal gambling age where you live,
          whichever is higher. You are responsible for knowing whether sports betting
          is lawful in your jurisdiction. We do not provide the service where it would
          be unlawful.
        </p>
      </DocSection>

      <DocSection title="4. Beta access">
        <p>
          {SITE.name} is currently in a closed beta. Access is free — we do not take
          payment, run subscriptions, or offer paid plans at this time. That may change
          in the future, and this page will be updated before it does.
        </p>
      </DocSection>

      <DocSection title="5. Your account">
        <p>
          Accounts are personal. Sharing credentials, redistributing picks, scraping
          the site, or reselling access will result in termination.
        </p>
      </DocSection>

      <DocSection title="6. Responsible gambling">
        <p>
          Only stake money you can afford to lose. Do not chase losses. If gambling is
          causing you harm, stop and reach out to a gambling support service where you
          live.
        </p>
      </DocSection>

      <DocSection title="7. Limitation of liability">
        <p>
          To the fullest extent permitted by law, we are not liable for gambling
          losses, missed bets, closed lines, or bookmaker disputes.
        </p>
      </DocSection>
    </DocPage>
  );
}
