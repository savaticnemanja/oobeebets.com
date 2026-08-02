import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/ui/motion";
import { StatTile } from "@/components/stat-tile";
import { getHeadlineStats } from "@/lib/stats";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "About us",
  description:
    "Who runs oobee bets, how the board is built, and why every loss stays on the record.",
  alternates: { canonical: "/about" },
};

/**
 * Rendered per request, because the stats strip below reads the database and a
 * build has none in reach — CI builds before it migrates, and the image builds
 * against a placeholder DATABASE_URL that points at nothing. `revalidate` here
 * would mean prerendered, and prerendered means read at build time.
 *
 * This is what the page already did. Until the pre-launch gate landed, every
 * page under (site) was dynamic because SiteHeader reads the session cookie;
 * the gate swaps in PrelaunchChrome, which does not, and the two pages that
 * never called getAuth() themselves — this one and /track-record — silently
 * became prerenderable and took the build down. Saying it here rather than
 * relying on a header two levels up is the point.
 *
 * Falling back to zeroes the way /sitemap.xml does is not an option: a page
 * about grading every loss in public must not ship a baked-in 0–0 record.
 */
export const dynamic = "force-dynamic";

export default async function AboutPage() {
  const stats = await getHeadlineStats();

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
              The losses sit on the same page as the wins, permanently, and the win rate
              is the arithmetic of everything we published — not a highlight reel.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold tracking-tight text-fg">
              How the board works
            </h2>
            <p className="mt-2">
              We put out thirty plays a day across soccer, basketball, baseball, tennis,
              hockey and football. They&apos;re ranked 1 to 30 — rank 1 is the bet
              we&apos;d make if we could only make one, rank 30 is the last one still
              worth the money.
            </p>
            <p className="mt-3">
              Your plan decides how far down that list you go. It&apos;s the same board
              for everyone; nobody gets a different rank 1. The Top Pick of the Day is
              free to everyone, every day, subscribed or not.
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
              Why we cap the room
            </h2>
            <p className="mt-2">
              Lines move when enough money follows them. A pick published to ten thousand
              people is a worse pick by the time half of them have placed it. We cap
              membership at 1,000 and raise the price instead of the headcount — and your
              price freezes the day you join.
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
        <dl className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Picks daily" value="30" tone="brand" />
          <StatTile label="Settled" value={stats.settled} />
          <StatTile
            label="Record"
            value={`${stats.wins}–${stats.losses}`}
          />
          <StatTile
            label="Net units"
            tone={stats.netUnits >= 0 ? "hit" : "miss"}
            value={`${stats.netUnits > 0 ? "+" : ""}${stats.netUnits.toFixed(2)}u`}
          />
        </dl>
      </Reveal>

      <Reveal delay={0.15}>
        <div className="mt-12 flex flex-col gap-3 sm:flex-row">
          <Button asChild>
            <Link href="/track-record">
              See the full record <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/pricing">View plans</Link>
          </Button>
        </div>
      </Reveal>
    </div>
  );
}
