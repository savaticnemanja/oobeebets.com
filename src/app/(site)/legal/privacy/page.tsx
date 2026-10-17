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
          version of your password (never the password itself). The display name, @handle, bio
          and profile picture you choose — the picture is cropped and re-saved when you upload
          it, which strips its location and camera details. Your phone number and how much you typically spend on betting a month,
          if you give them — both are optional. When you accepted the Terms, and when you last
          signed in.
        </p>
        <p>
          <strong className="text-fg">What you do here.</strong> Your posts and replies, your
          likes, reposts and follows, and which
          posts you have viewed (that is how view counts work). The picks you mark as taken, and
          the parlays you build, share or play. Feedback you send us, with the page you sent it
          from and your browser. Reports you file, and who you mute or block — the person you
          report, mute or block is never told who did it, though a block shows on your profile
          to them.
        </p>
        <p>
          <strong className="text-fg">The waitlist.</strong> If you join it — from the homepage or
          the sign-up page — your email address, which form you used and when, plus your answers to the
          sign-up questions if you gave them (your name, whether you&apos;re 21+, how and where you bet,
          and what you&apos;d want from us). We email you once to confirm the address is yours; if you
          don&apos;t, the address and any answers are deleted after 7 days. Once confirmed, we use the
          address only to tell you when there&apos;s a place for you, and the answers to understand
          who&apos;s testing. Every waitlist email has a link to leave, and leaving deletes the address
          and the answers. Making an account takes you off the waitlist; the answers stay with your
          account. If you joined our earlier launch list, your address was moved here, and our email
          provider (Resend) also kept a copy from then.
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
          Other testers see your display name, @handle, profile picture and bio, your posts and replies, the
          posts you like and repost, who you follow and who follows you, and any parlay you
          share to Community.
        </p>
        <p>
          Nobody else sees your email address, phone number or spend. The picks you mark as
          taken, your parlays and your Stats are yours: other testers only ever see totals.
          Oobee&apos;s admins can see all of the above, to run the beta.
        </p>
        <p>
          Your profile picture can be opened by anyone who has its link, without signing in.
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
            <strong className="text-fg">Resend</strong> sends our emails — invites, sign-up
            links, waitlist mail, password resets and announcements — so it receives your email
            address and the message.
          </li>
          <li>
            <strong className="text-fg">The Odds API</strong> supplies odds and scores. Nothing
            about you is sent to it.
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
          Delete your account yourself at any time, from the bottom of your account page. It
          removes your profile and everything in it — posts, profile picture, likes, follows, ticks,
          parlays and your sign-up answers — and signs you out everywhere; feedback and reports you
          sent stay, without your name on them. Email us for a copy of your data; during the beta we
          do that by hand, within 30 days. Oobee&apos;s own picks and their results stay on the record; they never
          contained anything about you.
        </p>
      </DocSection>

      <DocSection title="Contact">
        <p>Email us at privacy@{SITE.domain} for anything on this page.</p>
      </DocSection>
    </DocPage>
  );
}
