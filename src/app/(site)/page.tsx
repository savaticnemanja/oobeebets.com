import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Eye, ListChecks, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatTile } from "@/components/stat-tile";
import { Reveal, Stagger, StaggerItem, CountUp, PulseDot } from "@/components/ui/motion";
import { getHeadlineStats } from "@/lib/stats";
import { SITE, appUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: `${SITE.name} — ${SITE.tagline}`,
  description: SITE.description,
  alternates: { canonical: "/" },
};

// Numbers change when a pick settles; a short window keeps the landing page
// cheap without ever being meaningfully stale.
export const revalidate = 60;

export default async function HomePage() {
  const stats = await getHeadlineStats();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE.name,
    url: SITE.url,
    description: SITE.description,
    logo: appUrl("/icons/icon-512.png"),
    sameAs: [`https://twitter.com/${SITE.twitter.replace("@", "")}`],
  };

  return (
    <>
      <script
        type="application/ld+json"
        // JSON-LD is data, not markup; it is serialised, never user-authored.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* ------------------------------------------------------------ hero */}
      <section className="relative mx-auto max-w-6xl px-4 pb-16 pt-20 sm:px-6 sm:pt-28">
        <Reveal>
          <div className="flex items-center gap-2">
            <PulseDot />
            <span className="text-[0.6875rem] font-medium uppercase tracking-[0.2em] text-brand">
              Beta — top 15 free for testers
            </span>
          </div>
        </Reveal>

        <Reveal delay={0.05}>
          <h1 className="mt-5 max-w-3xl text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
            Every pick we make,{" "}
            <span className="text-brand">settled in public.</span>
          </h1>
        </Reveal>

        <Reveal delay={0.1}>
          <p className="mt-5 max-w-xl text-pretty text-base leading-relaxed text-fg-muted sm:text-lg">
            Thirty picks a day, ranked best to worst. The top 15 are free for everyone
            during our beta. Every one is graded against the real final score — the
            losses stay on the page next to the wins.
          </p>
        </Reveal>

        <Reveal delay={0.15}>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button size="lg" asChild>
              <Link href="/picks">
                Today&apos;s board
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </Reveal>

        {/* ------------------------------------------------------ stat strip */}
        <Reveal delay={0.2}>
          <dl className="mt-14 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile
              label="Net units"
              tone={stats.netUnits >= 0 ? "hit" : "miss"}
              value={
                <CountUp
                  value={stats.netUnits}
                  decimals={2}
                  prefix={stats.netUnits > 0 ? "+" : ""}
                  suffix="u"
                />
              }
              sub="1 unit staked per pick"
            />
            <StatTile
              label="Record"
              value={`${stats.wins}–${stats.losses}`}
              sub={`${stats.settled} settled`}
            />
            <StatTile
              label="Win rate"
              tone={stats.sampleTooSmall ? "neutral" : "brand"}
              value={
                stats.sampleTooSmall ? (
                  <span className="text-fg-muted">—</span>
                ) : (
                  <CountUp value={(stats.winRate ?? 0) * 100} decimals={1} suffix="%" />
                )
              }
              sub={stats.sampleTooSmall ? "Too few to be a rate" : "On settled picks"}
            />
            <StatTile
              label="Picks daily"
              tone="brand"
              value="15"
              sub="Free during the beta"
            />
          </dl>
        </Reveal>
      </section>

      {/* ------------------------------------------------------ how it works */}
      <section
        aria-labelledby="how-heading"
        className="mx-auto max-w-6xl px-4 py-16 sm:px-6"
      >
        <Reveal>
          <h2 id="how-heading" className="text-2xl font-semibold tracking-tight sm:text-3xl">
            How it works
          </h2>
        </Reveal>

        <Stagger className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            {
              icon: ListChecks,
              title: "We rank the board",
              body: "Thirty plays a day, ordered 1 to 30 by how much we like them. Rank 1 is the pick we'd make if we could only make one.",
            },
            {
              icon: Eye,
              title: "You see the top",
              body: "The top 15 are free for everyone during our beta trial. Every pick comes with the reasoning.",
            },
            {
              icon: ShieldCheck,
              title: "We settle in public",
              body: "Every pick is graded against the final score and stays on the track record forever. Nothing gets quietly deleted.",
            },
          ].map((step) => (
            <StaggerItem key={step.title}>
              <div className="card-hairline h-full p-5 transition-colors hover:border-border-strong">
                <div className="w-fit rounded-lg bg-brand/10 p-2 text-brand">
                  <step.icon className="size-5" aria-hidden="true" />
                </div>
                <h3 className="mt-4 font-semibold tracking-tight">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-fg-muted">{step.body}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* -------------------------------------------------------------- about */}
      <section aria-labelledby="about-heading" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <Reveal>
          <div className="card-hairline overflow-hidden">
            <div className="grid gap-8 p-6 sm:p-10 md:grid-cols-2">
              <div>
                <h2
                  id="about-heading"
                  className="text-2xl font-semibold tracking-tight sm:text-3xl"
                >
                  About us
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-fg-muted">
                  We are a small team that bets for a living and got tired of tipsters
                  who post winners and delete losers. So we built the opposite: a board
                  where every pick is logged before kick-off and graded after, whether it
                  lands or not.
                </p>
                <p className="mt-4 text-sm leading-relaxed text-fg-muted">
                  No parlay bait, no &ldquo;lock of the century&rdquo;, no screenshots of
                  slips we never placed. One unit per pick, a public ledger, and a room
                  we deliberately keep small.
                </p>
                <Button variant="link" asChild className="mt-4">
                  <Link href="/about">
                    Read the full story <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
              </div>

              <ul className="space-y-3">
                {[
                  "Every pick logged before the game starts",
                  "Losses stay on the record, permanently",
                  "One unit staked per pick — no chasing",
                  "Capped membership, no volume growth",
                  "Cancel any time, no lock-in",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm text-fg-muted">
                    <CheckCircle2
                      className="mt-0.5 size-4 shrink-0 text-hit"
                      aria-hidden="true"
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Reveal>
      </section>
    </>
  );
}
