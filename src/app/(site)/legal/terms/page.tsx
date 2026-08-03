import type { Metadata } from "next";
import Link from "next/link";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of use",
  description: `Terms for using the ${SITE.name} pre-launch site and email list.`,
  alternates: { canonical: "/legal/terms" },
};

/**
 * Cut to what the site actually offers today: a page and an email list.
 *
 * The previous draft ran to eight sections on subscriptions, billing, free
 * trials, refunds and account termination — for a product nobody can reach.
 * Publishing commitments about a service that does not exist is worse than
 * publishing nothing: they are live terms, and §4's price-lock and §8's
 * "amount you paid us" liability cap were both being offered to people who
 * cannot pay us anything.
 *
 * Those sections are not lost — `git log` has them, and they need restoring
 * (with counsel, per FSD O6: legal entity + jurisdiction) as part of opening
 * signup, not before.
 */

/** Shown to visitors, so it has to be updated whenever the copy below changes. */
const LAST_UPDATED = "3 August 2026";

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
            has not launched. Right now this site does one thing: it takes an
            email address so we can tell you when we open. Nothing is for sale, no
            account exists, and no picks are published. These terms cover that and
            nothing more &mdash; full terms will replace them before anything is sold,
            and we will not charge anyone under this page.
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
            customer funds, or place bets for anyone. When picks are published they will
            be opinion, they will lose regularly, and nothing we write is a guarantee of
            profit or a prediction of a certain outcome. Every bet you place is your
            decision and your risk.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-fg">3. Who can join the list</h2>
          <p className="mt-2">
            You must be at least 18, or the legal gambling age where you live if that is
            higher. You are responsible for knowing whether sports betting is lawful
            where you are; we do not offer the service where it would not be.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-fg">4. The email list</h2>
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
          <h2 className="text-base font-semibold text-fg">5. Liability</h2>
          <p className="mt-2">
            The site is provided as it is, and we do not promise it will be uninterrupted
            or that we will launch on any particular date. To the fullest extent the law
            allows, we are not liable for any loss arising from your use of this
            pre-launch site or the list &mdash; including gambling losses, which nothing
            here could have caused, since we have not published a pick yet. Nothing in
            these terms limits liability that cannot legally be limited.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-fg">6. Responsible gambling</h2>
          <p className="mt-2">
            When we do launch: only stake what you can afford to lose, and do not chase
            losses. If gambling is causing you harm, stop and seek help from a
            support service in your country &mdash; free and confidential help is
            available, and it is independent of us.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-fg">7. Changes and contact</h2>
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
