import type { Metadata } from "next";
import { SITE } from "@/lib/site";

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
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Terms of service</h1>
      <p className="mt-2 text-xs uppercase tracking-wider text-pending">
        Draft — must be reviewed by a lawyer before launch
      </p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-fg-muted">
        <section>
          <h2 className="text-base font-semibold text-fg">1. What we sell</h2>
          <p className="mt-2">
            {SITE.name}{" "}
            sells access to sports betting information and analysis. We are not a
            bookmaker, sportsbook, exchange, or financial adviser. We do not accept
            wagers, hold customer funds, or place bets on anyone&apos;s behalf.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-fg">2. No guarantee</h2>
          <p className="mt-2">
            Picks are opinion. They lose regularly and are published with that
            expectation. Nothing on this site is a guarantee, a prediction of a certain
            outcome, or a promise of profit. Past performance does not indicate future
            results. You are solely responsible for every bet you place and for any
            money you lose.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-fg">3. Eligibility</h2>
          <p className="mt-2">
            You must be at least 18 years old, or the legal gambling age where you live,
            whichever is higher. You are responsible for knowing whether sports betting
            is lawful in your jurisdiction. We do not provide the service where it would
            be unlawful.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-fg">4. Subscriptions and billing</h2>
          <p className="mt-2">
            Subscriptions renew monthly until cancelled. Cancelling stops the next
            renewal; access continues to the end of the period you have already paid for.
            We do not offer partial refunds for unused time. The price you subscribe at
            stays fixed for as long as your subscription remains continuously active;
            price changes apply to new subscriptions and to any subscription restarted
            after a lapse.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-fg">5. Free trials</h2>
          <p className="mt-2">
            Where offered, a free trial is limited to one per person and per account. A
            payment method is required, and the subscription begins automatically at the
            end of the trial unless cancelled first. We may withdraw trials at any time.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-fg">6. Your account</h2>
          <p className="mt-2">
            Accounts are personal. Sharing credentials, redistributing picks, scraping
            the site, or reselling access will result in termination without refund.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-fg">7. Responsible gambling</h2>
          <p className="mt-2">
            Only stake money you can afford to lose. Do not chase losses. If gambling is
            causing you harm, stop and seek help — links are in the footer of every page.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-fg">8. Limitation of liability</h2>
          <p className="mt-2">
            To the fullest extent permitted by law, our total liability to you is limited
            to the amount you paid us in the twelve months before the claim. We are not
            liable for gambling losses, missed bets, closed lines, or bookmaker disputes.
          </p>
        </section>
      </div>
    </div>
  );
}
