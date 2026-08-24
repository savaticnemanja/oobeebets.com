import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { asc, eq, sql } from "drizzle-orm";
import { CalendarDays } from "lucide-react";
import { db } from "@/db";
import { picks as picksTable, slates } from "@/db/schema";
import type { Pick } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import { visiblePicks } from "@/lib/board";
import { PickCard, TopPickCard } from "@/components/pick-card";
import { Badge } from "@/components/ui/badge";
import { Reveal } from "@/components/ui/motion";
import { SlateDatePicker } from "@/components/slate-date-picker";
import { isValidSlateDate, slateDateString } from "@/lib/slate-date";
import { formatSlateDate } from "@/lib/i18n/format";

export const metadata: Metadata = {
  title: "Today's picks",
  description: "The top 15 picks for today — free during our beta.",
  robots: { index: false, follow: false },
};

// Per-request: what a viewer may see depends on whether they're signed in
// and whether they're an admin.
export const dynamic = "force-dynamic";

export default async function PicksPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; welcome?: string }>;
}) {
  const [auth, params] = await Promise.all([getAuth(), searchParams]);
  if (!auth) redirect("/login?next=/picks");

  const today = slateDateString();
  const requested = params.date && isValidSlateDate(params.date) ? params.date : today;

  // Only admins can browse history — everyone else always sees today's board.
  const date = auth.isAdmin ? requested : today;

  const [slate] = await db.select().from(slates).where(eq(slates.date, date)).limit(1);

  // Admins preview drafts; nobody else sees an unpublished slate exists.
  const visible = Boolean(slate?.publishedAt) || auth.isAdmin;

  const rows: Pick[] = visible
    ? await db
        .select()
        .from(picksTable)
        .where(eq(picksTable.slateDate, date))
        .orderBy(asc(picksTable.rank))
    : [];

  // Admins preview the whole slate; everyone else sees the top VISIBLE_PICKS.
  const view = visiblePicks(rows, auth.isAdmin);
  const [top, ...rest] = view;

  // Only the admin date picker consumes this, and only admins can browse to
  // another date at all — so a tester's board does not pay for the query.
  const availableDates = auth.isAdmin
    ? await db
        .select({ date: slates.date })
        .from(slates)
        .where(sql`${slates.publishedAt} is not null`)
        .orderBy(sql`${slates.date} desc`)
        .limit(30)
    : [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      {params.welcome === "1" && (
        <div
          role="status"
          className="mb-6 rounded-lg border border-brand/25 bg-brand/5 px-4 py-3 text-sm text-brand"
        >
          Account created. The top 15 picks are free, every day, during our beta.
        </div>
      )}

      {/* -------------------------------------------------------------- head */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {date === today ? "Today's board" : formatSlateDate(date)}
          </h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg-muted">
            <CalendarDays className="size-3.5" aria-hidden="true" />
            <span className="num">{formatSlateDate(date)}</span>
            {slate?.publishedAt ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{view.length} picks, free</span>
              </>
            ) : null}
            {!slate?.publishedAt && rows.length > 0 && (
              <Badge variant="pending">Draft — admin preview</Badge>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {auth.isAdmin && availableDates.length > 0 && (
            <SlateDatePicker dates={availableDates.map((d) => d.date)} current={date} />
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------- empty */}
      {view.length === 0 ? (
        <div className="card-hairline mt-10 p-10 text-center">
          <h2 className="text-lg font-semibold tracking-tight">
            {date === today ? "The board isn't up yet" : "Nothing published for this day"}
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-fg-muted">
            {date === today
              ? "Picks go out before the first kick-off. Check back shortly."
              : "Try another date."}
          </p>
        </div>
      ) : (
        <>
          {/* ------------------------------------------------- top pick hero */}
          {top && (
            <div className="mt-8">
              <Reveal>
                <TopPickCard pick={top} />
              </Reveal>
            </div>
          )}

          {/* ----------------------------------------------------- the board */}
          {rest.length > 0 && (
            <section aria-labelledby="board-heading" className="mt-10">
              <h2 id="board-heading" className="text-sm font-semibold tracking-tight">
                The rest of the board
              </h2>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {rest.map((p, i) => (
                  <Reveal key={p.id} delay={Math.min(i * 0.02, 0.2)}>
                    <PickCard pick={p} />
                  </Reveal>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
