import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DocPage, DocSection } from "@/components/doc-page";
import { SITE, pageSocial } from "@/lib/site";
import { billingEnabled } from "@/lib/billing/stripe";

const description = "Who runs oobee bets, how the board is built, and why every loss stays on the record.";

export const metadata: Metadata = {
  title: "About us",
  description,
  alternates: { canonical: "/about" },
  ...pageSocial("/about", `About us · ${SITE.name}`, description),
};

export default function AboutPage() {
  return (
    <DocPage title="About us">
      <DocSection>
        <p className="text-fg">
          {SITE.name} is a small operation. We bet for a living, we publish what we bet,
          and we grade all of it on the record.
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
          We put out up to fifteen NFL game bets and fifteen player props on every
          game day. Each comes with its price, its stake and the reasoning behind it,
          and the ones we like most are featured at the top of the day.
        </p>
        {billingEnabled() ? (
          <p>
            The #1 game bet and #1 player prop are free every game day. Base, Pro and Elite
            open the top 5, top 10 or all 15 of each, and Pro and Elite add our parlays —
            see <Link href="/account#plan" className="text-brand hover:underline">Plans</Link>.
          </p>
        ) : (
          <p>
            During our beta the whole board is free for every tester — no plan
            required.
          </p>
        )}
      </DocSection>

      <DocSection title="One unit, nearly every time">
        <p>
          Picks are staked at one unit, and any pick that isn&apos;t says so on its
          card. Every stake is set before the game starts and never changed after.
          No chasing, no tripling up after a bad Saturday, no &ldquo;max play of the
          year&rdquo; — variable stakes let you hide a losing record behind one lucky
          big bet.
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
