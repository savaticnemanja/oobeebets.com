import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { issueFormToken } from "@/lib/spam-guard";
import { SubscribeForm } from "@/components/newsletter/subscribe-form";
import { SITE, appUrl } from "@/lib/site";
import { shareCard } from "@/lib/metadata";
import { getLocale, localeConfig } from "@/lib/i18n/config";

/**
 * The pre-launch signup page, and the site's root.
 *
 * It used to be `/soon`, served at `/` through a rewrite in the gate's proxy.
 * With the product gone there is nothing left to gate, so this is simply the
 * root page — which also means it prerenders instead of passing through
 * middleware on every request.
 */
// Written once and used four times: the page title, the meta description, and
// both share cards. Overriding `title`/`description` alone left og: and
// twitter: inheriting the root layout's evergreen brand copy, so a link to this
// page previewed as "Every pick, settled in public." while the page it opened
// said "launching soon" — the share card sold a product, the page asked for an
// email.
const TITLE = `${SITE.name} — launching soon`;
const DESCRIPTION =
  "Daily sports betting picks with a public, unedited track record. We're launching soon — join the list for the launch notification.";

export const metadata: Metadata = {
  // Absolute, or the root layout's `%s · oobee bets` template appends the brand
  // to a title that already opens with it.
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  ...shareCard({ title: TITLE, description: DESCRIPTION, path: "/" }),
};

/**
 * Organization and WebSite, which is all a one-page pre-launch site can
 * honestly claim.
 *
 * The two are linked by `@id` rather than nested so the publisher is one entity
 * a crawler can resolve, not a copy inside another node. Deliberately absent:
 * SearchAction (there is no search endpoint to point it at) and any
 * aggregateRating or Offer — describing a product nobody can buy yet is the
 * kind of structured data that earns a manual action rather than a rich result.
 */
function structuredData(): string {
  const locale = localeConfig(getLocale());
  const organizationId = appUrl("/#organization");

  return JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": organizationId,
        name: SITE.name,
        url: appUrl("/"),
        description: SITE.description,
        email: SITE.supportEmail,
        logo: {
          "@type": "ImageObject",
          url: appUrl("/icons/icon-512.png"),
          width: 512,
          height: 512,
        },
        // The same claim the twitter:site meta tag already makes.
        sameAs: [`https://x.com/${SITE.twitter.replace(/^@/, "")}`],
      },
      {
        "@type": "WebSite",
        "@id": appUrl("/#website"),
        name: SITE.name,
        url: appUrl("/"),
        description: SITE.description,
        inLanguage: locale.tag,
        publisher: { "@id": organizationId },
      },
    ],
  });
}

export default async function PrelaunchPage() {
  // Signed in, the app is home: the logo and every "/" link land on the feed.
  if (await getAuth()) redirect("/home");

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-12 sm:px-6 sm:pt-20">
      <script
        type="application/ld+json"
        // Serialised by JSON.stringify from values we control — no user input
        // reaches this, and Next renders script children verbatim.
        dangerouslySetInnerHTML={{ __html: structuredData() }}
      />
      {/* Delays are staggered by hand rather than through the motion components:
          this is the one page every visitor loads, and a CSS keyframe already
          in the theme costs nothing to ship. */}
      <div className="animate-rise">
        <div className="flex items-center gap-2.5">
          {/* The dot grows with the label so the badge stays in proportion —
              the ripple rings are inset from this span, so they scale too. */}
          <span className="ripple size-2.5" aria-hidden="true">
            <span className="relative inline-flex size-2.5 rounded-full bg-brand" />
          </span>
          <span className="text-sm font-medium uppercase tracking-[0.2em] text-brand">
            Launching soon
          </span>
        </div>
      </div>

      <h1
        className="animate-rise mt-6 text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl"
        style={{ animationDelay: "60ms" }}
      >
        Every pick we make,{" "}
        <span className="text-brand">settled in public.</span>
      </h1>

      <p
        className="animate-rise mt-5 max-w-xl text-pretty text-base leading-relaxed text-fg-muted sm:text-lg"
        style={{ animationDelay: "120ms" }}
      >
        We&rsquo;re not open yet. The board is being built &mdash; thirty picks a day,
        ranked best to worst, every one graded against the real final score. Leave your
        email and you&rsquo;ll be first through the door.
      </p>

      <div className="animate-rise max-w-xl" style={{ animationDelay: "180ms" }}>
        <SubscribeForm formToken={issueFormToken()} />
        <p className="mt-4 text-sm text-fg-muted">
          Already have an account?{" "}
          <Link href="/login" className="text-brand hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
