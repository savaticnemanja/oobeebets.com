import type { Metadata } from "next";
import { PricingGrid } from "@/components/pricing-grid";
import { Reveal } from "@/components/ui/motion";
import { Badge } from "@/components/ui/badge";
import { getSeatUsage, getSettings } from "@/lib/settings";
import { getAuth } from "@/lib/auth";
import { SITE } from "@/lib/site";
import { TIERS, TRIAL_DAYS } from "@/lib/tiers";
import { formatSlateDate } from "@/lib/slate-date";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Three plans, 6 / 15 / 30 picks a day. Membership is capped and the price rises monthly — the price you join at is the price you keep.",
  alternates: { canonical: "/pricing" },
};

export const revalidate = 60;

const FAQ = [
  {
    q: "How many picks do I actually get?",
    a: "Base unlocks the top 6 of the day, Pro the top 15, Elite all 30. The board is ranked 1 to 30, so every plan gets the best plays first — higher plans go further down.",
  },
  {
    q: "Why does the price keep going up?",
    a: "We cap the room at 1,000 members instead of growing forever, so the only lever we have is price. The important part: your price is frozen the day you join. Increases only ever apply to new members.",
  },
  {
    q: "Can I see the record before I pay?",
    a: "Yes. The full track record is public, including the losses, and the Top Pick of the Day is free to everyone every day.",
  },
  {
    q: "What happens when I cancel?",
    a: "You keep access until the end of the period you already paid for, then it stops. No cancellation fee and no phone call.",
  },
  {
    q: "Do you place bets for me?",
    a: "No. We publish information and reasoning. You place your own bets at your own book, at your own stake, and you own the outcome.",
  },
];

export default async function PricingPage() {
  const [settings, seats, auth] = await Promise.all([
    getSettings(),
    getSeatUsage(),
    getAuth(),
  ]);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Product",
        name: `${SITE.name} membership`,
        description: SITE.description,
        brand: { "@type": "Brand", name: SITE.name },
        offers: Object.values(TIERS).map((t) => ({
          "@type": "Offer",
          name: t.name,
          price: (settings.pricing[t.id] / 100).toFixed(2),
          priceCurrency: "USD",
          availability:
            seats.left > 0
              ? "https://schema.org/InStock"
              : "https://schema.org/SoldOut",
          url: `${SITE.url}/pricing`,
        })),
      },
      {
        "@type": "FAQPage",
        mainEntity: FAQ.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <Reveal>
          <div className="text-center">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">
              Pick your depth
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-pretty text-fg-muted">
              Same board, same ranking. The plan decides how far down it you see.
            </p>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              {seats.left > 0 ? (
                <Badge variant="brand">
                  {seats.left} of {seats.cap} seats left
                </Badge>
              ) : (
                <Badge variant="miss">At capacity</Badge>
              )}
              {settings.nextPriceRiseAt && (
                <Badge variant="pending">
                  Price rises {formatSlateDate(settings.nextPriceRiseAt)}
                </Badge>
              )}
              {settings.trialsEnabled && !auth?.user.hasUsedTrial && (
                <Badge variant="outline">{TRIAL_DAYS}-day free trial</Badge>
              )}
            </div>
          </div>
        </Reveal>

        <div className="mt-12">
          <PricingGrid
            pricing={settings.pricing}
            seatsLeft={seats.left}
            trialsEnabled={settings.trialsEnabled}
            currentTier={auth?.tier ?? null}
            isAuthed={Boolean(auth)}
            hasUsedTrial={auth?.user.hasUsedTrial ?? false}
          />
        </div>

        {/* ------------------------------------------------------------- FAQ */}
        <section aria-labelledby="faq-heading" className="mx-auto mt-24 max-w-2xl">
          <Reveal>
            <h2
              id="faq-heading"
              className="text-2xl font-semibold tracking-tight sm:text-3xl"
            >
              Straight answers
            </h2>
          </Reveal>
          <dl className="mt-8 space-y-6">
            {FAQ.map((f, i) => (
              <Reveal key={f.q} delay={i * 0.04}>
                <div className="border-b border-border pb-6 last:border-0">
                  <dt className="font-medium text-fg">{f.q}</dt>
                  <dd className="mt-2 text-sm leading-relaxed text-fg-muted">{f.a}</dd>
                </div>
              </Reveal>
            ))}
          </dl>
        </section>
      </div>
    </>
  );
}
