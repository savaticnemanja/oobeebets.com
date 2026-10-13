import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getAuth } from "@/lib/auth";
import { getUserParlays } from "@/lib/parlay-store";
import { ParlayCard } from "@/components/parlay-card";
import { DeleteParlayButton } from "@/components/parlay-builder";
import { CommunityParlayBuilder, ShareToggle } from "@/components/community-parlay-builder";
import { SocialShell } from "@/components/social/social-shell";
import { getSlateGames } from "@/lib/odds/board";
import { ensureSlateOdds } from "@/lib/odds/sync";
import { slateDateString } from "@/lib/slate-date";

export const metadata: Metadata = {
  title: "Build a parlay",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The parlay builder, on its own page — reached from the + on Community — so
 * Community itself is only the tickets people shared, laid out like Oobee's.
 * Your own tickets from today sit under the builder, with their share and
 * delete controls.
 */
export default async function BuildParlayPage() {
  const auth = await getAuth();
  if (!auth) redirect("/login?next=/community/new");

  const today = slateDateString();
  // Refreshed only if the stored copy is stale, so reloads don't spend credits.
  await ensureSlateOdds(today);
  const [games, mine] = await Promise.all([getSlateGames(today), getUserParlays(auth.user.id)]);
  const mineToday = mine.filter((p) => p.slateDate === today);

  return (
    <SocialShell>
      <div className="flex items-center gap-3 px-2 py-2">
        <Link
          href="/community"
          aria-label="Back to Community"
          className="grid size-9 place-items-center rounded-full transition-colors hover:bg-surface-2"
        >
          <ArrowLeft className="size-5" aria-hidden="true" />
        </Link>
        <h1 className="text-xl font-bold tracking-tight">Build a parlay</h1>
      </div>

      <section aria-label="Parlay builder" className="border-b border-border px-4 pb-4 pt-2">
        <CommunityParlayBuilder games={games} />
      </section>

      {mineToday.length > 0 && (
        <section aria-labelledby="my-parlays-heading">
          <div className="border-b border-border px-4 py-3">
            <h2 id="my-parlays-heading" className="text-base font-bold tracking-tight">
              Your parlays today
            </h2>
            <p className="mt-0.5 text-xs text-fg-subtle">
              Graded leg by leg as the games finish. Shared ones are on{" "}
              <Link href="/community" className="text-brand hover:underline">
                Community
              </Link>
              ; private ones only here and on My bets.
            </p>
          </div>
          {mineToday.map((pl) => (
            <ParlayCard key={pl.id} parlay={pl} variant="row">
              <div className="flex items-center gap-3">
                <ShareToggle parlayId={pl.id} shared={pl.shared} />
                {pl.open && <DeleteParlayButton parlayId={pl.id} />}
              </div>
            </ParlayCard>
          ))}
        </section>
      )}
    </SocialShell>
  );
}
