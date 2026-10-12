import "server-only";
import Link from "next/link";
import { and, asc, desc, eq, inArray, lt, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { parlays as parlaysTable, pickFollows, picks as picksTable, slates } from "@/db/schema";
import type { Pick, PickCategory } from "@/db/schema";
import type { AuthContext } from "@/lib/auth";
import { CATEGORY_NOUN, visiblePicks, type BoardTab } from "@/lib/board";
import { getCommunityParlays, getOobeeParlays, type ParlayView } from "@/lib/parlay-store";
import { followWindowOpen, type ViewerFollow } from "@/lib/follows";
import { pickProfit } from "@/lib/settlement";
import { slateDateString } from "@/lib/slate-date";
import { formatSlateDate } from "@/lib/i18n/format";
import { ParlayCard } from "@/components/parlay-card";
import { PickCard, TopPickCard } from "@/components/pick-card";
import { Avatar, displayNameOf } from "@/components/social/identity";
import { Badge } from "@/components/ui/badge";
import { Reveal } from "@/components/ui/motion";
import { cn } from "@/lib/utils";

/** Days per chunk. Infinite scroll loads the next chunk from the last day shown. */
const DAYS_PER_CHUNK = 5;

/** Whole days between two YYYY-MM-DD slate dates (a minus b). */
function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86_400_000);
}

/**
 * One chunk of the day-by-day board: up to five days, newest first, each
 * rendered under its own heading, plus the cursor for the chunk after it.
 *
 * `before` null is the first chunk, which always leads with today. The page
 * renders that one; the infinite-scroll action renders the rest, so both come
 * from this one function and look the same.
 *
 * Only days with something on this tab are listed, so a slate with no props
 * never leaves an empty "Player props" day behind. The pick tabs follow slates
 * (published ones, plus drafts for admins) carrying this tab's picks or Oobee
 * parlays; Community follows the days anyone shared a parlay, since it needs
 * no Oobee slate.
 */
export async function loadBoardDays({
  auth,
  tab,
  category,
  before,
}: {
  auth: AuthContext;
  tab: BoardTab;
  category: PickCategory;
  before: string | null;
}): Promise<{ node: React.ReactNode; next: string | null; todayPicks: number }> {
  const today = slateDateString();
  const isParlayTab = tab === "parlay";
  const isCommunityTab = tab === "community";

  const dayRows: { date: string }[] = isCommunityTab
    ? await db
        .selectDistinct({ date: parlaysTable.slateDate })
        .from(parlaysTable)
        .where(
          and(
            eq(parlaysTable.shared, true),
            before ? lt(parlaysTable.slateDate, before) : lte(parlaysTable.slateDate, today),
          ),
        )
        .orderBy(desc(parlaysTable.slateDate))
        .limit(DAYS_PER_CHUNK + 1)
    : await db
        .select({ date: slates.date })
        .from(slates)
        .where(
          and(
            before ? lt(slates.date, before) : lte(slates.date, today),
            auth.isAdmin ? undefined : sql`${slates.publishedAt} is not null`,
            isParlayTab
              ? sql`exists (select 1 from ${parlaysTable} where ${parlaysTable.slateDate} = ${slates.date} and ${parlaysTable.ownerId} is null)`
              : sql`exists (select 1 from ${picksTable} where ${picksTable.slateDate} = ${slates.date} and ${picksTable.category} = ${category})`,
          ),
        )
        .orderBy(desc(slates.date))
        .limit(DAYS_PER_CHUNK + 1);

  const found = dayRows.map((d) => d.date);
  // Today always leads the first chunk, so there is somewhere to say "nothing yet".
  const withToday = before === null && !found.includes(today) ? [today, ...found] : found;
  const days = withToday.slice(0, DAYS_PER_CHUNK);
  const next = withToday.length > DAYS_PER_CHUNK || found.length > DAYS_PER_CHUNK ? days.at(-1)! : null;

  const slateRows = days.length
    ? await db.select({ date: slates.date, publishedAt: slates.publishedAt }).from(slates).where(inArray(slates.date, days))
    : [];
  const publishedOn = new Set(slateRows.filter((s) => s.publishedAt).map((s) => s.date));
  const draftOn = new Set(slateRows.filter((s) => !s.publishedAt).map((s) => s.date));
  // Admins preview drafts; nobody else sees an unpublished slate exists.
  const visibleDays = days.filter((d) => publishedOn.has(d) || auth.isAdmin);

  /* ----------------------------------------------------------- pick tabs */

  // One query for every day in the chunk. (slate_date, category) is the
  // leading edge of picks_slate_rank_unique, so this is an index range read.
  const rows: Pick[] =
    !isParlayTab && !isCommunityTab && visibleDays.length
      ? await db
          .select()
          .from(picksTable)
          .where(and(inArray(picksTable.slateDate, visibleDays), eq(picksTable.category, category)))
          .orderBy(asc(picksTable.rank))
      : [];
  // Admins preview whole slates; everyone else sees each day's top VISIBLE_PICKS.
  const picksOn = new Map(
    visibleDays.map((d) => [d, visiblePicks(rows.filter((r) => r.slateDate === d), auth.isAdmin)]),
  );
  const shownPicks = [...picksOn.values()].flat();

  // Which of these picks this viewer has already ticked off — see the note on
  // pick_follows in db/schema.ts.
  const takenIds = shownPicks.length
    ? new Set(
        (
          await db
            .select({ pickId: pickFollows.pickId })
            .from(pickFollows)
            .where(and(eq(pickFollows.userId, auth.user.id), inArray(pickFollows.pickId, shownPicks.map((p) => p.id))))
        ).map((r) => r.pickId),
      )
    : new Set<string>();

  /** A draft gets no control: there is nothing to take yet, and the action refuses it anyway. */
  function followFor(p: Pick): ViewerFollow | undefined {
    if (!publishedOn.has(p.slateDate)) return undefined;
    return { taken: takenIds.has(p.id), open: followWindowOpen(p) };
  }

  /* --------------------------------------------------------- parlay tabs */

  const oobeeOn = new Map<string, ParlayView[]>(
    isParlayTab ? await Promise.all(visibleDays.map(async (d) => [d, await getOobeeParlays(d)] as const)) : [],
  );
  const communityOn = new Map<string, ParlayView[]>(
    isCommunityTab ? await Promise.all(days.map(async (d) => [d, await getCommunityParlays(d)] as const)) : [],
  );

  /* ------------------------------------------------------------- render */

  const node = days.map((d) => {
    const isToday = d === today;
    const draft = draftOn.has(d) && auth.isAdmin;
    const dayPicks = picksOn.get(d) ?? [];

    if (isCommunityTab) {
      // Today's own parlays are listed above the board with their controls.
      const list = (communityOn.get(d) ?? []).filter((pl) => !(isToday && pl.ownerId === auth.user.id));
      return (
        <DaySection key={d} date={d} today={today}>
          {list.length === 0 ? (
            <Empty>{isToday ? "Nobody has shared a parlay today yet. Build one and be first." : "No shared parlays this day."}</Empty>
          ) : (
            <div className="grid gap-3">
              {list.map((pl) => (
                <ParlayCard key={pl.id} parlay={pl}>
                  <Owner parlay={pl} />
                </ParlayCard>
              ))}
            </div>
          )}
        </DaySection>
      );
    }

    if (isParlayTab) {
      const list = oobeeOn.get(d) ?? [];
      return (
        <DaySection key={d} date={d} today={today} draft={draft}>
          {list.length === 0 ? (
            <Empty>{isToday ? "None up yet today — they go out with the rest of the board." : "No Oobee parlays this day."}</Empty>
          ) : (
            <div className="grid gap-3">
              {list.map((pl, i) => (
                <Reveal key={pl.id} delay={Math.min(i * 0.03, 0.2)}>
                  <ParlayCard parlay={pl} featured={isToday && pl.rank === 1} />
                </Reveal>
              ))}
            </div>
          )}
        </DaySection>
      );
    }

    // Pick tabs. Today leads with its top pick; earlier days are shown as they
    // were graded, every rank in the grid.
    const [top, ...rest] = isToday ? dayPicks : [undefined, ...dayPicks];
    return (
      <DaySection key={d} date={d} today={today} draft={draft} picks={dayPicks}>
        {dayPicks.length === 0 ? (
          <Empty>
            {isToday
              ? `No ${CATEGORY_NOUN[category]}s up yet — picks go out before the first kick-off.`
              : `No ${CATEGORY_NOUN[category]}s this day.`}
          </Empty>
        ) : (
          <>
            {top && (
              <Reveal>
                <TopPickCard pick={top} follow={followFor(top)} />
              </Reveal>
            )}
            {rest.length > 0 && (
              <div className={cn("grid gap-3 sm:grid-cols-2", top && "mt-3")}>
                {rest.map((p, i) => (
                  <Reveal key={p!.id} delay={Math.min(i * 0.02, 0.2)}>
                    <PickCard pick={p!} follow={followFor(p!)} />
                  </Reveal>
                ))}
              </div>
            )}
          </>
        )}
      </DaySection>
    );
  });

  return { node, next, todayPicks: picksOn.get(today)?.length ?? 0 };
}

/**
 * One day of the board. The heading sticks while you scroll through that day
 * (under the phone's top bar, at the very top beside the sidebar), and on a
 * day with graded picks carries its record: won–lost(–push) and net units.
 */
function DaySection({
  date,
  today,
  draft,
  picks,
  children,
}: {
  date: string;
  today: string;
  draft?: boolean;
  picks?: Pick[];
  children: React.ReactNode;
}) {
  const diff = dayDiff(today, date);
  const name = diff === 0 ? "Today" : diff === 1 ? "Yesterday" : null;

  const settled = (picks ?? []).filter((p) => p.status !== "pending");
  const won = settled.filter((p) => p.status === "won").length;
  const lost = settled.filter((p) => p.status === "lost").length;
  const pushed = settled.filter((p) => p.status === "push").length;
  const units = settled.reduce((sum, p) => sum + pickProfit(p), 0);

  return (
    <section aria-labelledby={`day-${date}-heading`} id={`day-${date}`} className="mt-8 scroll-mt-20">
      <div className="sticky top-[calc(3.5rem+var(--spacing-safe-top))] z-20 -mx-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border bg-black/80 px-4 py-3 backdrop-blur-xl sm:top-0 sm:-mx-6 sm:px-6">
        <h2 id={`day-${date}-heading`} className="flex items-baseline gap-2 text-base font-semibold tracking-tight">
          {name && <span>{name}</span>}
          <span className={cn("num", name ? "text-sm font-normal text-fg-muted" : "")}>{formatSlateDate(date)}</span>
          {draft && <Badge variant="pending">Draft — admin preview</Badge>}
        </h2>
        {settled.length > 0 && (
          <p className="num text-sm text-fg-muted">
            {won}–{lost}
            {pushed > 0 ? `–${pushed}` : ""}
            <span className="mx-1.5 text-fg-subtle" aria-hidden="true">·</span>
            <span className={cn(units > 0 ? "text-hit" : units < 0 ? "text-miss" : "")}>
              {units > 0 ? "+" : ""}
              {units.toFixed(2)}u
            </span>
          </p>
        )}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-fg-muted">{children}</p>;
}

/** Who shared a Community parlay, in the ticket's action slot. */
function Owner({ parlay }: { parlay: ParlayView }) {
  if (!parlay.ownerUsername) return null;
  const name = displayNameOf({ displayName: parlay.ownerDisplayName, username: parlay.ownerUsername });
  return (
    <Link
      href={`/u/${parlay.ownerUsername}`}
      className="flex min-w-0 items-center gap-2 text-xs text-fg-muted hover:text-fg"
    >
      <Avatar name={name} size="sm" className="size-6 text-[0.625rem]" />
      <span className="truncate">
        {name} <span className="text-fg-subtle">@{parlay.ownerUsername}</span>
      </span>
    </Link>
  );
}
