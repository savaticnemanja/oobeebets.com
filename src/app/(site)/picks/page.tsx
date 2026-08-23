import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq, sql } from "drizzle-orm";
import { ArrowRight, CalendarDays } from "lucide-react";
import { db } from "@/db";
import { picks as picksTable, slates } from "@/db/schema";
import type { Pick } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import { PickCard, TopPickCard } from "@/components/pick-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Reveal } from "@/components/ui/motion";
import { SlateDatePicker } from "@/components/slate-date-picker";
import { FREE_VISIBLE_RANKS } from "@/lib/tiers";
import { isValidSlateDate, slateDateString } from "@/lib/slate-date";
import { formatSlateDate } from "@/lib/i18n/format";

export const metadata: Metadata = {
  title: "Today's picks",
  description: "The top 15 picks for today — free during our beta.",
  robots: { index: false, follow: false },
};

// Per-request: what a viewer may see depends on their subscription.
export const dynamic = "force-dynamic";

export default async function PicksPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; welcome?: string }>;
}) {
  const [auth, params] = await Promise.all([getAuth(), searchParams]);

  const today = slateDateString();
  const requested = params.date && isValidSlateDate(params.date) ? params.date : today;

  // Non-subscribers can only look at today — history is part of what's sold.
  const date = auth?.tier || auth?.isAdmin ? requested : today;

  const [slate] = await db.select().from(slates).where(eq(slates.date, date)).limit(1);

  // Admins preview drafts; nobody else sees an unpublished slate exists.
  const visible = Boolean(slate?.publishedAt) || Boolean(auth?.isAdmin);

  // Beta: one free tier for everyone — top 15, no locked/paid split.
  const rows: Pick[] = visible
    ? await db
        .select()
        .from(picksTable)
        .where(eq(picksTable.slateDate, date))
        .orderBy(asc(picksTable.rank))
        .limit(FREE_VISIBLE_RANKS)
    : [];

  const view = rows.map((p) => ({ ...p, locked: false as const }));
  const [top, ...rest] = view;

  const availableDates = await db
    .select({ date: slates.date })
    .from(slates)
    .where(sql`${slates.publishedAt} is not null`)
    .orderBy(sql`${slates.date} desc`)
    .limit(30);

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
          {(auth?.tier || auth?.isAdmin) && availableDates.length > 0 && (
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
              ? "Picks go out before the first kick-off. Check back shortly, or look at what we've done so far."
              : "Try another date, or read the full record."}
          </p>
          <Button variant="outline" className="mt-6" asChild>
            <Link href="/track-record">
              See the track record <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
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
