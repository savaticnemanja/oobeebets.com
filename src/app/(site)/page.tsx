import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Eye, ListChecks, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal, Stagger, StaggerItem, PulseDot } from "@/components/ui/motion";
import { SITE, appUrl } from "@/lib/site";
import { getAuth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { billingEnabled } from "@/lib/billing/stripe";
import { signupEnabled } from "@/lib/signup";
import { GetStartedForm } from "@/components/get-started-form";

// No `title`: the root layout's default is this page's title, and a title
// here would go through its "%s · oobee bets" template — the brand twice.
export const metadata: Metadata = {
  description: SITE.description,
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  // Signed in, the front page is the feed — as on X.
  if (await getAuth()) redirect("/home");
  const paid = billingEnabled();
  const open = signupEnabled();

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
      <section className="shell relative pb-16 pt-20 sm:pt-28">
        <Reveal>
          <div className="flex items-center gap-2">
            <PulseDot />
            <span className="text-[0.6875rem] font-medium uppercase tracking-[0.2em] text-brand">
              {paid ? "Beta — the #1 game bet and prop free every game day" : "Beta — the whole board free for testers"}
            </span>
          </div>
        </Reveal>

        <Reveal delay={0.05}>
          <h1 className="mt-5 max-w-3xl text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
            Every pick we make,{" "}
            <span className="text-brand">settled on the record.</span>
          </h1>
        </Reveal>

        <Reveal delay={0.1}>
          <p className="mt-5 max-w-xl text-pretty text-base leading-relaxed text-fg-muted sm:text-lg">
            Up to fifteen NFL game bets and fifteen player props every game day, each with the
            reasoning behind it —{" "}
            {paid
              ? "the top pick of each free, the rest on a plan."
              : "the whole board free for every tester during our beta."}{" "}
            Every one is graded against the real final score, and the losses stay on
            the page next to the wins.
          </p>
        </Reveal>

        <Reveal delay={0.15}>
          <div className="mt-8 max-w-lg">
            <GetStartedForm open={open} source="landing" />
            <p className="mt-4 text-sm text-fg-muted">
              Already have an account?{" "}
              <Link href="/login" className="text-brand hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        </Reveal>
      </section>

      {/* ------------------------------------------------------ how it works */}
      <section
        aria-labelledby="how-heading"
        className="shell py-16"
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
              title: "We build the board",
              body: "Up to fifteen NFL game bets and fifteen player props every game day, each with its price, stake and reasoning. The ones we like most are featured at the top.",
            },
            {
              icon: Eye,
              title: "You see all of it",
              body: paid
                ? "The #1 game bet and prop are free every game day, and every settled pick is open to everyone — the record is never behind a plan. Mark the ones you take and keep your own."
                : "Every pick is free during our beta — nothing held back behind a plan. Mark the ones you take and keep your own record.",
            },
            {
              icon: ShieldCheck,
              title: "We settle every pick",
              body: "Every pick is graded against the final score and stays on the track record for good. Nothing gets quietly deleted.",
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
      <section aria-labelledby="about-heading" className="shell py-16">
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
                  No &ldquo;lock of the century&rdquo;, no screenshots of slips we never
                  placed. Every pick shows its price and stake before the game starts,
                  the ledger never gets edited, and we keep the room deliberately small.
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
                  "Stakes set before kick-off — never raised to chase a loss",
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
