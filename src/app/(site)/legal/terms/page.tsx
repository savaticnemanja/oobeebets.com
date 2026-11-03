import type { Metadata } from "next";
import { SITE, pageSocial } from "@/lib/site";
import { DocPage, DocSection } from "@/components/doc-page";
import { billingEnabled } from "@/lib/billing/stripe";
import { PLAN, PLAN_PRICE_LABEL } from "@/lib/plan";

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
        <DocSection title="4. Subscription and payment">
          <p>
            Every pick is open to everyone once it&apos;s graded. Seeing picks before
            they&apos;re graded takes a subscription, at the price shown when you subscribe
            ({PLAN_PRICE_LABEL} at the time of writing).
          </p>
          <p>
            A new subscription starts with a {PLAN.trialDays}-day free trial, once per
            account. You give a card through Stripe when you start it, and nothing is charged
            during the trial. When the trial ends the subscription renews automatically every{" "}
            {PLAN.intervalWeeks} weeks and the price is charged to that card at the start of
            each period, until you cancel.
          </p>
          <p>
            You can cancel at any time in Settings. Cancelling stops every future
            charge; you keep access to the end of the period already paid for, or of the trial,
            in which case nothing is ever charged. Payments are not refunded, including for part
            of a period, except where the law requires it. If a renewal can&apos;t be charged,
            access to open picks pauses until it is paid. Deleting your account cancels the
            subscription straight away.
          </p>
          <p>
            A subscription buys access to our picks and nothing more: it doesn&apos;t
            guarantee any result (see section 2).
          </p>
        </DocSection>
      ) : (
        <DocSection title="4. Access">
          <p>
            Access to {SITE.name} is free — we do not take
            payment or sell subscriptions at this time. That may change
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
          What you post stays yours. By posting it, you let us show it to other users on
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
