import { asc, sql } from "drizzle-orm";
import { db } from "@/db";
import { picks } from "@/db/schema";
import { SettleList } from "@/components/admin/settle-list";
import { CommunityLegList } from "@/components/admin/community-leg-list";
import { getPendingCommunityLegs } from "@/lib/odds/board";
import { requireAdminPage } from "@/lib/auth";
import { refreshResults } from "@/lib/odds/sync";
import { Badge } from "@/components/ui/badge";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Settle" };

export const dynamic = "force-dynamic";

export default async function AdminSettlePage() {
  await requireAdminPage();
  // Game lines grade themselves from the final score; fetch any that are due
  // first, so this page only lists what genuinely needs a person.
  await refreshResults();
  const communityLegs = await getPendingCommunityLegs();

  // Anything that has started and is still pending needs a result. Ordered
  // oldest-first so the longest-outstanding games get cleared first.
  const due = await db
    .select()
    .from(picks)
    .where(sql`${picks.status} = 'pending' and ${picks.startsAt} < now()`)
    .orderBy(asc(picks.startsAt));

  const upcoming = await db
    .select()
    .from(picks)
    .where(sql`${picks.status} = 'pending' and ${picks.startsAt} >= now()`)
    .orderBy(asc(picks.startsAt))
    .limit(20);

  const recent = await db
    .select()
    .from(picks)
    .where(sql`${picks.settledAt} is not null`)
    .orderBy(sql`${picks.settledAt} desc`)
    .limit(15);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settle</h1>
          <p className="mt-1.5 text-sm text-fg-muted">
            Game bets settle themselves from the final score, and NFL player props from
            the box score a few hours after the game. What is left here is a prop the
            stats feed couldn&apos;t match to one player, a player who didn&apos;t play,
            hand-entered picks from before the feed, and corrections. Every result is written to the audit log and appears on
            the public record immediately.
          </p>
        </div>
        {due.length > 0 && <Badge variant="brand">{due.length} waiting</Badge>}
      </div>

      <div className="mt-8 space-y-10">
        <section aria-labelledby="due-heading">
          <h2 id="due-heading" className="text-sm font-semibold tracking-tight">
            Games that have finished
          </h2>
          <div className="mt-3">
            <SettleList picks={due} emptyMessage="Nothing waiting — you're up to date." />
          </div>
        </section>

        <section aria-labelledby="community-legs-heading">
          <h2 id="community-legs-heading" className="text-sm font-semibold tracking-tight">
            Community parlay legs
          </h2>
          <p className="mt-1 text-xs text-fg-subtle">
            Player props testers put in their parlays. NFL props grade themselves from the
            box score; anything still here needs a result from you.
          </p>
          <div className="mt-3">
            <CommunityLegList legs={communityLegs} />
          </div>
        </section>

        {upcoming.length > 0 && (
          <section aria-labelledby="upcoming-heading">
            <h2 id="upcoming-heading" className="text-sm font-semibold tracking-tight">
              Not started yet
            </h2>
            <p className="mt-1 text-xs text-fg-subtle">
              You can settle early if a result is already known.
            </p>
            <div className="mt-3">
              <SettleList picks={upcoming} emptyMessage="" muted />
            </div>
          </section>
        )}

        {recent.length > 0 && (
          <section aria-labelledby="recent-heading">
            <h2 id="recent-heading" className="text-sm font-semibold tracking-tight">
              Recently settled
            </h2>
            <p className="mt-1 text-xs text-fg-subtle">
              Reopening a settled pick changes published numbers — it is logged.
            </p>
            <div className="mt-3">
              <SettleList picks={recent} emptyMessage="" settled />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
