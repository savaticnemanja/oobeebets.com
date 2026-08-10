import type { Metadata } from "next";
import Link from "next/link";
import { SITE } from "@/lib/site";
import { shareCard } from "@/lib/metadata";

const DESCRIPTION = `How ${SITE.name} handles the email address you give the pre-launch list.`;

export const metadata: Metadata = {
  title: "Privacy policy",
  description: DESCRIPTION,
  alternates: { canonical: "/legal/privacy" },
  // The page title carries the brand, since the card is read without the
  // %s · oobee bets template the <title> gets.
  ...shareCard({
    title: `Privacy policy · ${SITE.name}`,
    description: DESCRIPTION,
    path: "/legal/privacy",
  }),
};

/**
 * Scoped to the pre-launch phase, and deliberately narrow.
 *
 * The previous draft described accounts, passwords, sessions and a payment
 * processor, none of which exist while the gate is up. Overstating collection
 * is not a harmless placeholder — accuracy is the actual transparency
 * obligation, and a notice that describes the wrong service fails it.
 *
 * Everything below is checked against what the code really does: Resend's
 * contact book holds the address and is the only copy of it (lib/newsletter.ts),
 * and `rateLimits` holds the IP for fifteen minutes (lib/auth.ts). Widen this
 * in step with the product, not ahead of it — the account and billing sections
 * belong back here the day signup opens.
 */

/** Shown to visitors, so it has to be updated whenever the copy below changes. */
const LAST_UPDATED = "3 August 2026";

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Privacy policy</h1>
      <p className="mt-2 text-xs uppercase tracking-wider text-fg-subtle">
        Last updated {LAST_UPDATED}
      </p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-fg-muted">
        <section>
          <p>
            {SITE.name}{" "}
            has not launched yet. The only thing this site does today is
            take an email address for the pre-launch list, so this policy covers only
            that. There are no accounts, no payments and no picks to buy. When the
            product opens we will publish an updated policy covering the rest, and
            everyone on the list will be told before it takes effect.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-fg">What we collect</h2>
          <p className="mt-2">
            <strong className="font-medium text-fg">Your email address</strong>, when you
            type it into the signup form, together with the date you joined.
          </p>
          <p className="mt-2">
            <strong className="font-medium text-fg">Your IP address</strong>, recorded
            briefly when you submit the signup or unsubscribe form. It is used only to
            count how many times a form has been submitted from one place, so the list
            cannot be flooded with fake addresses or used to send mail to a stranger.
          </p>
          <p className="mt-2">
            That is the complete list. We do not ask for your name, we do not collect
            anything about the pages you visit, and we do not build a profile of you.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-fg">Why we are allowed to hold it</h2>
          <p className="mt-2">
            We rely on your <strong className="font-medium text-fg">consent</strong>{" "}
            for the email address &mdash; you gave it to us by submitting the form, and you
            can withdraw it at any time by unsubscribing, which costs you one click and
            no explanation.
          </p>
          <p className="mt-2">
            We rely on our{" "}
            <strong className="font-medium text-fg">legitimate interest</strong> in
            keeping the service working for the IP address, for the abuse control
            described above.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-fg">Who else sees it</h2>
          <p className="mt-2">
            <strong className="font-medium text-fg">Resend</strong>{" "}
            both stores the list and delivers our email. Your address is held in their
            contact book &mdash; that is the only copy of it, we do not keep a second
            one in our own database &mdash; and is used to send you the welcome note and
            the launch announcement. They process it on our instructions and for no
            purpose of their own.
          </p>
          <p className="mt-2">
            Resend operates outside the UK and the EEA, so your address may be processed
            there under the safeguards their data processing terms provide.
          </p>
          <p className="mt-2">
            Nobody else. We do not sell your data, we do not rent or share it with
            advertisers, and we do not pass it to other tipsters, bookmakers or
            affiliates.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-fg">How long we keep it</h2>
          <p className="mt-2">
            Your address stays on the list until you unsubscribe or ask us to erase it.
          </p>
          <p className="mt-2">
            When you unsubscribe your address is marked as opted out rather than deleted
            outright, so that a later import or a mistake on our side cannot put you
            back on a list you have already left. It is used for nothing else, and never
            mailed. If you would rather it were erased completely, ask us and we will do
            it &mdash; that removes the safeguard, so re-subscribing later is the only
            thing that would bring you back.
          </p>
          <p className="mt-2">
            IP records are discarded about fifteen minutes after the submission that
            created them.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-fg">Cookies and tracking</h2>
          <p className="mt-2">
            This site sets no advertising or analytics cookies, and runs no third-party
            trackers, pixels or tag managers. There is nothing here to consent to, which
            is why you have not been shown a cookie banner.
          </p>
          <p className="mt-2">
            Your browser may store a small offline cache of the page itself so it still
            loads without a connection. It holds no personal data, and clearing your
            browsing data removes it.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-fg">Your rights</h2>
          <p className="mt-2">
            You can ask us for a copy of what we hold about you, ask us to correct it,
            ask us to delete it, ask us to restrict or stop using it, or withdraw your
            consent. Withdrawing consent does not affect anything we did before you
            withdrew it.
          </p>
          <p className="mt-2">
            The fastest route to most of this is the{" "}
            <Link href="/unsubscribe" className="text-brand hover:underline">
              unsubscribe page
            </Link>
            , which needs no account and no reply from us. For anything else, email us
            and we will respond within one month.
          </p>
          <p className="mt-2">
            If you think we have handled your data badly, please tell us first so we can
            put it right &mdash; but you are entitled to complain to the data protection
            regulator in your country regardless, and you do not need our permission to
            do so.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-fg">Age</h2>
          <p className="mt-2">
            {SITE.name}{" "}
            is for adults: you must be at least 18, or the legal gambling age
            where you live if that is higher. The list is not directed at children and we
            do not knowingly hold a child&apos;s details. If you believe a child has
            subscribed, email us and we will remove the address.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-fg">Changes</h2>
          <p className="mt-2">
            If this policy changes we will update the date at the top of the page. If the
            change is a significant one &mdash; and the move from a newsletter to a full
            product will be &mdash; we will email the list rather than rely on you
            noticing.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-fg">Contact</h2>
          <p className="mt-2">
            Email{" "}
            <a href={`mailto:${SITE.supportEmail}`} className="text-brand hover:underline">
              {SITE.supportEmail}
            </a>{" "}
            about anything on this page, including any request to see or delete your
            data.
          </p>
        </section>
      </div>
    </div>
  );
}
