import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { getAuth } from "@/lib/auth";
import { sportFilterFromParam } from "@/lib/board";
import { refreshResults } from "@/lib/odds/sync";
import { LoadMore } from "@/components/load-more";
import { SocialShell } from "@/components/social/social-shell";
import { InfoTip } from "@/components/ui/info-tip";
import { SportPills } from "@/components/board/sport-pills";
import { loadBoardAction } from "@/app/actions/feeds";
import { loadBoardDays } from "../picks/board-days";

export const metadata: Metadata = {
  title: "Community",
  description: "Parlays testers built and shared, day by day.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Community: the parlays testers built and shared, day by day — its own page,
 * apart from Picks, which is Oobee's board. Same layout as Picks (the 600px
 * column, sport pills, sticky day headings) without the tab strip. The + in
 * the header is the way to build one (/community/new). Each ticket is a post,
 * so it can be liked, replied to and reposted.
 */
export default async function CommunityPage({ searchParams }: { searchParams: Promise<{ sport?: string }> }) {
  const [auth, params] = await Promise.all([getAuth(), searchParams]);
  if (!auth) redirect("/login?next=/community");

  const sportFilter = sportFilterFromParam(params.sport);
  // Grade anything whose game has finished before reading results.
  await refreshResults();
  const first = await loadBoardDays({ auth, tab: "community", category: "game", sportFilter, before: null });
  const pillHref = (key: string | null) => `/community${key ? `?sport=${key}` : ""}`;

  return (
    <SocialShell>
      {/* The page is named by the nav; the heading is for screen readers. */}
      <h1 className="sr-only">Community</h1>

      <SportPills
        active={sportFilter}
        hrefFor={pillHref}
        below="bar"
        actions={
          <>
            <Link
              href="/community/new"
              aria-label="Build a parlay"
              title="Build a parlay"
              className="grid size-9 place-items-center rounded-full text-brand transition-colors hover:bg-brand/10"
            >
              <Plus className="size-5" aria-hidden="true" />
            </Link>
            <InfoTip label="About Community">
              <p>
                Parlays testers built from the day&apos;s lines and shared, newest day first, graded
                leg by leg as the games finish.
              </p>
              <p>Build your own with the + — share it here, or keep it on your Stats.</p>
            </InfoTip>
          </>
        }
      />

      {first.node}
      <LoadMore
        key={sportFilter?.key ?? "all"}
        next={first.next}
        load={loadBoardAction.bind(null, "community", sportFilter?.key ?? "")}
      />
    </SocialShell>
  );
}
