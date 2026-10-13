import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DocPage, DocSection } from "@/components/doc-page";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "About us",
  description:
    "Who runs oobee bets, how the board is built, and why every loss stays on the record.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <DocPage title="About us">
      <DocSection>
        <p className="text-fg">
          {SITE.name} is a small operation. We bet for a living, we publish what we bet,
          and we grade all of it in public.
        </p>
      </DocSection>

      <DocSection title="Why this exists">
        <p>
          Every tipster has a great record if they get to choose which bets count.
          Screenshot the winner, delete the loser, post the parlay that hit and never
          mention the four that didn&apos;t. It works because nobody can check.
        </p>
        <p>
          So we made it checkable. Every pick is logged with its price and stake
          before the game starts, and settled against the real final score after.
          The losses count the same as the wins, permanently, and the win rate is
          the arithmetic of everything we published — not a highlight reel.
        </p>
      </DocSection>

      <DocSection title="How the board works">
        <p>
          We put out fifteen plays a day across soccer, basketball, baseball,
          tennis, hockey and football. They&apos;re ranked 1 to 15 — rank 1 is the
          bet we&apos;d make if we could only make one, rank 15 is the last one
          still worth the money.
        </p>
        <p>
          During our beta the whole board is free, for everyone — same fifteen
          picks, same rank 1, no plan required.
        </p>
      </DocSection>

      <DocSection title="One unit, every time">
        <p>
          Every pick is staked at one unit unless stated otherwise. No chasing, no
          tripling up after a bad Saturday, no &ldquo;max play of the year&rdquo;.
          Flat staking is the only way a track record means anything — variable
          stakes let you hide a losing record behind one lucky big bet.
        </p>
      </DocSection>

      <DocSection title="What we're not">
        <p>
          We&apos;re not a bookmaker. We don&apos;t take bets, hold your money, or
          place anything on your behalf. We sell information and the reasoning behind
          it; the decision, the stake and the outcome are yours. Some days that
          information is wrong — the record will tell you exactly how often.
        </p>
      </DocSection>

      <div className="px-4 py-6">
        <Button asChild className="rounded-full">
          <Link href="/picks">
            See today&apos;s picks <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </DocPage>
  );
}
