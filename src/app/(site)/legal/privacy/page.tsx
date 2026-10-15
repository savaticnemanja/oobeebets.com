import type { Metadata } from "next";
import { SITE, pageSocial } from "@/lib/site";
import { DocPage, DocSection } from "@/components/doc-page";
import { billingEnabled } from "@/lib/billing/stripe";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: `Privacy policy for ${SITE.name}.`,
  alternates: { canonical: "/legal/privacy" },
  ...pageSocial("/legal/privacy", `Privacy policy · ${SITE.name}`, `Privacy policy for ${SITE.name}.`),
};

/**
 * Placeholder — replace with counsel-reviewed copy before launch (FSD O6).
 *
 * It does have to be true in the meantime: this lists what the database
 * actually holds (src/db/schema.ts) and every outside service a tester's data
 * or browser touches. Add to it whenever either grows.
 */
export default function PrivacyPage() {
  const paid = billingEnabled();
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
          <strong className="text-fg">Your account.</strong> Your email address and a hashed
          version of your password (never the password itself). The display name, @handle and
          bio you choose. Your phone number and how much you typically spend on betting a month,
          if you give them — both are optional. When you accepted the Terms, and when you last
          signed in.
        </p>
        <p>
          <strong className="text-fg">What you do here.</strong> Your posts and replies, the
          photos and GIFs you add to them, your poll votes, likes, reposts and follows, and which
          posts you have viewed (that is how view counts work). The picks you mark as taken, and
          the parlays you build, share or play. Feedback you send us, with the page you sent it
          from and your browser. Reports you file, and who you mute or block — the person you
          report, mute or block is never told who did it, though a block shows on your profile
          to them.
        </p>
        <p>
          <strong className="text-fg">Signing in and security.</strong> For each device you sign
          in on, its IP address and browser, so you can stay signed in and we can spot misuse.
          Short-lived counts of sign-in and password-reset attempts, by email address and IP,
          to slow down guessing. Password-reset links, stored hashed. A log of admin actions,
          which can include your email address.
        </p>
        {paid ? (
          <p>
            If you take a plan: which plan, its status and when it renews, and the ID Stripe
            gives you as a customer. Your card details go to Stripe and never reach us.
          </p>
        ) : (
          <p>We collect no payment information — the beta is free.</p>
        )}
      </DocSection>

      <DocSection title="Who can see it">
        <p>
          Other testers see your display name, @handle and bio, your posts and replies, the
          posts you like and repost, who you follow and who follows you, and any parlay you
          share to Community.
        </p>
        <p>
          Nobody else sees your email address, phone number or spend. The picks you mark as
          taken, your parlays and your Stats are yours: other testers only ever see totals.
          Oobee&apos;s admins can see all of the above, to run the beta.
        </p>
        <p>
          A photo you post can be opened by anyone who has its link, without signing in.
        </p>
      </DocSection>

      <DocSection title="Services we use">
        <ul className="list-disc space-y-2 pl-5">
          {paid && (
            <li>
              <strong className="text-fg">Stripe</strong> takes payment for plans. When you
              subscribe it receives your email address and name from us, and your card and
              billing details from you on its own checkout page.
            </li>
          )}
          <li>
            <strong className="text-fg">Resend</strong> sends our emails — invites, password
            resets and announcements — so it receives your email address and the message.
          </li>
          <li>
            <strong className="text-fg">The Odds API</strong> supplies odds and scores. Nothing
            about you is sent to it.
          </li>
          <li>
            <strong className="text-fg">GIPHY</strong>, when GIF search is on: what you search
            for goes to GIPHY from our server, and the GIFs you see load from GIPHY&apos;s
            servers, which see your IP address.
          </li>
          <li>
            <strong className="text-fg">Link previews:</strong> when a post contains a link, our
            server fetches that page to build its preview, and the preview&apos;s image loads in
            your browser from that website, which sees your IP address.
          </li>
        </ul>
        <p>Everything else stays on our own servers.</p>
      </DocSection>

      <DocSection title="What we don't do">
        <p>
          We do not sell your data, we do not share it with advertisers, and we do not run
          analytics scripts, third-party tracking or advertising pixels on this site.
        </p>
      </DocSection>

      <DocSection title="How long we keep it">
        <p>
          Your account and what you post stay until you delete them or ask us to. Sign-ins stop
          working 30 days after a device was last used. Password-reset links work once, for 60
          minutes. Attempt counts clear themselves as their time window passes. Nightly backups
          of the database are kept for 7 days.
        </p>
      </DocSection>

      <DocSection title="Your rights">
        <p>
          Email us to get a copy of your data or to delete your account. During the beta we do
          this by hand, within 30 days. Deleting your account removes your profile and
          everything in it — posts, photos, likes, follows, ticks and parlays — and signs you
          out everywhere. Oobee&apos;s own picks and their results stay on the record; they never
          contained anything about you.
        </p>
      </DocSection>

      <DocSection title="Contact">
        <p>Email us at privacy@{SITE.domain} for anything on this page.</p>
      </DocSection>
    </DocPage>
  );
}
