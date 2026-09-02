import type { Metadata } from "next";
import Link from "next/link";
import { SITE } from "@/lib/site";
import { shareCard } from "@/lib/metadata";

const DESCRIPTION = `Terms for using the ${SITE.name} beta and email list.`;

export const metadata: Metadata = {
  title: "Terms of use",
  description: DESCRIPTION,
  alternates: { canonical: "/legal/terms" },
  ...shareCard({
    title: `Terms of use · ${SITE.name}`,
    description: DESCRIPTION,
    path: "/legal/terms",
  }),
};

/**
 * Cut to what the site actually offers today: a free invite-only beta, and an
 * email list.
 *
 * An older draft ran to eight sections on subscriptions, billing, free trials,
 * refunds and price locks — for a product nobody could reach. Those are still
 * absent and must stay absent: the beta takes no money, so a price-lock clause
 * or an "amount you paid us" liability cap would be a live commitment offered
 * to people who cannot pay us anything.
 *
 * They are not lost — `git log` has them — and they need restoring with
 * counsel (per FSD O6: legal entity + jurisdiction) as part of charging for
 * access, not before.
 */

/** Shown to visitors, so it has to be updated whenever the copy below changes. */
const LAST_UPDATED = "2 September 2026";

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Terms of use</h1>
      <p className="mt-2 text-xs uppercase tracking-wider text-fg-subtle">
        Last updated {LAST_UPDATED}
      </p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-fg-muted">
        <section>
          <h2 className="text-base font-semibold text-fg">1. What this site is today</h2>
          <p className="mt-2">
            {SITE.name}{" "}
            is in an invite-only beta. Two things are available: an account, if
            someone invites you, which gives you the daily board free of charge; and an
            email list anyone can join without an account. Nothing is for sale and we
            take no payment. These terms cover that and nothing more &mdash; full terms
            will replace them before anything is sold, and we will not charge anyone
            under this page.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-fg">
            2. We are not a bookmaker, and this is not advice
          </h2>
          <p className="mt-2">
            {SITE.name}{" "}
            sells information and opinion. We are not a bookmaker,
            sportsbook, exchange or financial adviser. We do not accept wagers, hold
            customer funds, or place bets for anyone. The picks we publish are opinion, they lose
            regularly, and nothing we write is a guarantee of profit or a prediction of a
            certain outcome. Every bet you place is your decision and your risk.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-fg">3. Who can take part</h2>
          <p className="mt-2">
            You must be at least 18, or the legal gambling age where you live if that is
            higher. You are responsible for knowing whether sports betting is lawful
            where you are; we do not offer the service where it would not be.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-fg">4. Beta access and your account</h2>
          <p className="mt-2">
            Access is by invitation and is free &mdash; we do not take payment, run
            subscriptions or offer paid plans. That may change, and this page will be
            updated before it does.
          </p>
          <p className="mt-2">
            Your account is personal to you. Sharing your login, redistributing the
            picks, scraping the site or reselling access will end your access. We may
            also change or withdraw the beta at any time; it is a beta, and we do not
            promise it will be uninterrupted.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-fg">5. The email list</h2>
          <p className="mt-2">
            Subscribing is free and commits you to nothing. You will get a welcome note,
            the launch announcement, and the occasional update in between &mdash; no
            picks, and nothing sold on to anyone else. You can leave at any time from the{" "}
            <Link href="/unsubscribe" className="text-brand hover:underline">
              unsubscribe page
            </Link>{" "}
            or the link in any email, and we may close or change the list before launch.
            What we do with your address is set out in our{" "}
            <Link href="/legal/privacy" className="text-brand hover:underline">
              privacy policy
            </Link>
            .
          </p>
          <p className="mt-2">
            Please only submit an address that is yours. Do not sign other people up,
            and do not try to break, overload or scrape the site.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-fg">6. Liability</h2>
          <p className="mt-2">
            The site is provided as it is, and we do not promise it will be uninterrupted.
            To the fullest extent the law allows, we are not liable for any loss arising
            from your use of the site, the beta or the list &mdash; including gambling
            losses, missed bets, closed lines and disputes with a bookmaker. Nothing in
            these terms limits liability that cannot legally be limited.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-fg">7. Responsible gambling</h2>
          <p className="mt-2">
            Only stake what you can afford to lose, and do not chase
            losses. If gambling is causing you harm, stop and seek help from a
            support service in your country &mdash; free and confidential help is
            available, and it is independent of us.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-fg">8. Changes and contact</h2>
          <p className="mt-2">
            We may update these terms; the date at the top says when we last did. Email{" "}
            <a href={`mailto:${SITE.supportEmail}`} className="text-brand hover:underline">
              {SITE.supportEmail}
            </a>{" "}
            with any question about this page.
          </p>
        </section>
      </div>
    </div>
  );
}
