import type { Metadata } from "next";
import { SITE, pageSocial } from "@/lib/site";
import { DocPage, DocSection } from "@/components/doc-page";
import { billingEnabled } from "@/lib/billing/stripe";

export const metadata: Metadata = {
  title: "Terms of service",
  description: `Terms of service for ${SITE.name}.`,
  alternates: { canonical: "/legal/terms" },
  ...pageSocial("/legal/terms", `Terms of service · ${SITE.name}`, `Terms of service for ${SITE.name}.`),
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
          You must be at least 21 years old, or older where the law where you live
          requires it, and allowed to bet on sports there. You are responsible for
          knowing whether sports betting is lawful in your jurisdiction. We do not
          provide the service where it would be unlawful.
        </p>
      </DocSection>

      {billingEnabled() ? (
        <DocSection title="4. Plans and billing">
          <p>
            {SITE.name} is in a closed beta. The top pick of each list is free every game day;
            the rest of the board comes with a paid plan (Base, Pro or Elite), as listed on
            the Plans page with its price.
          </p>
          <p>
            Plans are billed monthly in advance through Stripe and renew automatically each
            month until you cancel. You can cancel, change plan or update your card at any
            time from your account. A cancelled plan stays active until the end of the month
            already paid for and then does not renew. Changing plan takes effect right away,
            with the difference prorated on your next invoice. Payments already made are not
            refunded, except where the law requires it.
          </p>
          <p>
            If a payment fails we retry it for a short time, and the plan ends if it still
            can&apos;t be collected. We will tell subscribers by email before any price change
            applies to them; a new price applies from the next renewal after that notice.
          </p>
          <p>
            A plan buys access to our picks and nothing more: no plan guarantees any result
            (see section 2).
          </p>
        </DocSection>
      ) : (
        <DocSection title="4. Beta access">
          <p>
            {SITE.name} is currently in a closed beta. Access is free — we do not take
            payment, run subscriptions, or offer paid plans at this time. That may change
            in the future, and this page will be updated before it does.
          </p>
        </DocSection>
      )}

      <DocSection title="5. Your account">
        <p>
          Accounts are personal. Sharing your sign-in, scraping the site, copying the
          board wholesale, or reselling access will result in termination. Sharing a post,
          or a link to one, with friends is fine — that&apos;s what the Share button is for.
        </p>
      </DocSection>

      <DocSection title="6. What you post">
        <p>
          What you post stays yours. By posting it, you let us show it to other testers on
          the site, in feeds and in link previews, for as long as it is up.
        </p>
        <p>
          Don&apos;t post anything illegal, hateful or harassing, sexual content, or someone
          else&apos;s private information. Don&apos;t impersonate anyone — including{" "}
          {SITE.name} — and don&apos;t advertise paid picks, other services, or spam. We may
          remove posts and suspend or close accounts that break these rules. To tell us about
          a post or an account, choose Report from its ⋯ menu — an admin reads every report.
          You can also mute or block anyone from the same menu.
        </p>
      </DocSection>

      <DocSection title="7. Responsible gambling">
        <p>
          Only stake money you can afford to lose. Do not chase losses. If gambling is
          causing you harm, stop and get help: call or text 1-800-GAMBLER, the National
          Problem Gambling Helpline — free, confidential, and open around the clock.
        </p>
      </DocSection>

      <DocSection title="8. Limitation of liability">
        <p>
          To the fullest extent permitted by law, we are not liable for gambling
          losses, missed bets, closed lines, or bookmaker disputes.
        </p>
      </DocSection>
    </DocPage>
  );
}
