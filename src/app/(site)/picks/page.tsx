import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { CalendarDays, Circle } from "lucide-react";
import { db } from "@/db";
import { pickFollows, picks as picksTable, slates } from "@/db/schema";
import type { Pick } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import {
  CATEGORY_LABELS,
  CATEGORY_NOUN,
  PICKS_PER_SLATE,
  categoryFromParam,
  pickCategories,
  visiblePicks,
} from "@/lib/board";
import { followWindowOpen, type ViewerFollow } from "@/lib/follows";
import { PickCard, TopPickCard } from "@/components/pick-card";
import { Badge } from "@/components/ui/badge";
import { Reveal } from "@/components/ui/motion";
import { SlateDatePicker } from "@/components/slate-date-picker";
import { isValidSlateDate, slateDateString } from "@/lib/slate-date";
import { formatSlateDate } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Today's picks",
  description: `All ${PICKS_PER_SLATE.game} game bets and ${PICKS_PER_SLATE.prop} player props for today — free during our beta.`,
  robots: { index: false, follow: false },
};

// Per-request: what a viewer may see depends on whether they're signed in
// and whether they're an admin.
export const dynamic = "force-dynamic";

export default async function PicksPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; category?: string; welcome?: string }>;
}) {
  const [auth, params] = await Promise.all([getAuth(), searchParams]);
  if (!auth) redirect("/login?next=/picks");

  const today = slateDateString();
  const requested = params.date && isValidSlateDate(params.date) ? params.date : today;

  // Only admins can browse history — everyone else always sees today's board.
  const date = auth.isAdmin ? requested : today;
  const category = categoryFromParam(params.category);

  const [slate] = await db.select().from(slates).where(eq(slates.date, date)).limit(1);

  // Admins preview drafts; nobody else sees an unpublished slate exists.
  const visible = Boolean(slate?.publishedAt) || auth.isAdmin;

  // Filtered in SQL rather than in memory: (slate_date, category) is the
  // leading edge of picks_slate_rank_unique, so the tab query is an index
  // range read, and the tab you are not looking at is never fetched.
  const rows: Pick[] = visible
    ? await db
        .select()
        .from(picksTable)
        .where(and(eq(picksTable.slateDate, date), eq(picksTable.category, category)))
        .orderBy(asc(picksTable.rank))
    : [];

  // Counts for the tab labels — cheap, and the alternative is a tab that
  // claims nothing is there until you click it.
  const tallies = visible
    ? await db
        .select({ category: picksTable.category, n: sql<number>`count(*)::int` })
        .from(picksTable)
        .where(eq(picksTable.slateDate, date))
        .groupBy(picksTable.category)
    : [];
  const countFor = new Map(tallies.map((t) => [t.category, t.n]));

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

  // Which of these picks this viewer has already ticked off. Keyed on
  // (user_id, pick_id) in that order, so this is an index-only scan over at
  // most fifteen keys — see the note on pick_follows in db/schema.ts.
  const published = Boolean(slate?.publishedAt);
  const takenIds =
    published && view.length > 0
      ? new Set(
          (
            await db
              .select({ pickId: pickFollows.pickId })
              .from(pickFollows)
              .where(
                and(
                  eq(pickFollows.userId, auth.user.id),
                  inArray(
                    pickFollows.pickId,
                    view.map((p) => p.id),
                  ),
                ),
              )
          ).map((r) => r.pickId),
        )
      : new Set<string>();

  /**
   * An unpublished draft gets no control at all: an admin previewing tomorrow's
   * board has nothing to take yet, and the action refuses it anyway.
   */
  function followFor(p: Pick): ViewerFollow | undefined {
    if (!published) return undefined;
    return { taken: takenIds.has(p.id), open: followWindowOpen(p) };
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      {params.welcome === "1" && (
        <div
          role="status"
          className="mb-6 rounded-lg border border-brand/25 bg-brand/5 px-4 py-3 text-sm text-brand"
        >
          Account created. All {PICKS_PER_SLATE.game} game bets and{" "}
          {PICKS_PER_SLATE.prop} player props are free, every day, during our beta.
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
                <span>
                  {view.length} {CATEGORY_NOUN[category]}
                  {view.length === 1 ? "" : "s"}, free
                </span>
              </>
            ) : null}
            {!slate?.publishedAt && countFor.size > 0 && (
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

      {/* -------------------------------------------------------------- hint */}
      {/* Said once, at the top, rather than as a label on fifteen cards. The
          circles are discoverable on their own, but "it is one tap and we
          never ask for a stake" is not, and it is the part that decides
          whether a tester bothers. */}
      {published && view.length > 0 && (
        <p className="mt-5 flex items-start gap-2 text-xs leading-relaxed text-fg-subtle">
          <Circle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>
            Took one of these? Tap its circle. That&apos;s the whole thing — no stake,
            no book, no odds — and it locks when the game starts.
          </span>
        </p>
      )}

      {/* -------------------------------------------------------------- tabs */}
      <nav
        aria-label="Board"
        className="mt-8 -mb-px flex items-center gap-1 border-b border-border"
      >
        {pickCategories.map((c) => {
          const isActive = c === category;
          const n = countFor.get(c) ?? 0;
          return (
            <Link
              key={c}
              href={
                date === today
                  ? `/picks?category=${c}`
                  : `/picks?date=${date}&category=${c}`
              }
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "relative inline-flex items-center gap-2 px-3 py-2.5 text-sm font-medium transition-colors",
                isActive ? "text-brand" : "text-fg-muted hover:text-fg",
              )}
            >
              {CATEGORY_LABELS[c]}
              {n > 0 && <span className="num text-xs text-fg-subtle">{n}</span>}
              {isActive && (
                <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-brand" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* ------------------------------------------------------------- empty */}
      {view.length === 0 ? (
        <div className="card-hairline mt-8 p-10 text-center">
          <h2 className="text-lg font-semibold tracking-tight">
            {date === today
              ? `No ${CATEGORY_NOUN[category]}s up yet`
              : "Nothing published for this day"}
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-fg-muted">
            {date === today
              ? "Picks go out before the first kick-off. Check back shortly, or flip to the other tab."
              : "Try another date."}
          </p>
        </div>
      ) : (
        <>
          {/* ------------------------------------------------- top pick hero */}
          {top && (
            <div className="mt-8">
              <Reveal>
                <TopPickCard pick={top} follow={followFor(top)} />
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
                    <PickCard pick={p} follow={followFor(p)} />
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
