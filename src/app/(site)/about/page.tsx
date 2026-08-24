import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/ui/motion";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "About us",
  description:
    "Who runs oobee bets, how the board is built, and why every loss stays on the record.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
      <Reveal>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">About us</h1>
        <p className="mt-5 text-lg leading-relaxed text-fg-muted">
          {SITE.name}{" "}
          is a small operation. We bet for a living, we publish what we bet, and we
          grade all of it in public.
        </p>
      </Reveal>

      <Reveal delay={0.05}>
        <div className="prose-invert mt-10 space-y-6 text-sm leading-relaxed text-fg-muted">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-fg">
              Why this exists
            </h2>
            <p className="mt-2">
              Every tipster has a great record if they get to choose which bets count.
              Screenshot the winner, delete the loser, post the parlay that hit and never
              mention the four that didn&apos;t. It works because nobody can check.
            </p>
            <p className="mt-3">
              So we made it checkable. Every pick is logged with its price and stake
              before the game starts, and settled against the real final score after.
              The losses count the same as the wins, permanently, and the win rate is
              the arithmetic of everything we published — not a highlight reel.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold tracking-tight text-fg">
              How the board works
            </h2>
            <p className="mt-2">
              We put out fifteen plays a day across soccer, basketball, baseball,
              tennis, hockey and football. They&apos;re ranked 1 to 15 — rank 1 is the
              bet we&apos;d make if we could only make one, rank 15 is the last one
              still worth the money.
            </p>
            <p className="mt-3">
              During our beta the whole board is free, for everyone — same fifteen
              picks, same rank 1, no plan required.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold tracking-tight text-fg">
              One unit, every time
            </h2>
            <p className="mt-2">
              Every pick is staked at one unit unless stated otherwise. No chasing, no
              tripling up after a bad Saturday, no &ldquo;max play of the year&rdquo;.
              Flat staking is the only way a track record means anything — variable
              stakes let you hide a losing record behind one lucky big bet.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold tracking-tight text-fg">
              What we&apos;re not
            </h2>
            <p className="mt-2">
              We&apos;re not a bookmaker. We don&apos;t take bets, hold your money, or
              place anything on your behalf. We sell information and the reasoning behind
              it; the decision, the stake and the outcome are yours. Some days that
              information is wrong — the record will tell you exactly how often.
            </p>
          </div>
        </div>
      </Reveal>

      <Reveal delay={0.1}>
        <div className="mt-12 flex flex-col gap-3 sm:flex-row">
          <Button asChild>
            <Link href="/picks">
              See today&apos;s picks <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </Reveal>
    </div>
  );
}
