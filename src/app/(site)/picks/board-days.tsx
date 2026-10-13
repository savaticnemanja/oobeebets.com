import "server-only";
import Link from "next/link";
import { and, asc, desc, eq, gt, inArray, lt, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { parlays as parlaysTable, pickFollows, picks as picksTable, slates } from "@/db/schema";
import type { Pick, PickCategory } from "@/db/schema";
import type { AuthContext } from "@/lib/auth";
import { CATEGORY_NOUN, matchesSportFilter, visiblePicks, type BoardTab, type SportFilter } from "@/lib/board";
import { getCommunityParlays, getOobeeParlays, markPlayed, type ParlayView } from "@/lib/parlay-store";
import { followWindowOpen, type ViewerFollow } from "@/lib/follows";
import { pickProfit } from "@/lib/settlement";
import { slateDateString } from "@/lib/slate-date";
import { formatSlateDate } from "@/lib/i18n/format";
import { ParlayCard } from "@/components/parlay-card";
import { ParlayPost, playable } from "@/components/social/parlay-row";
import { getParlayPosts, type FeedPost } from "@/lib/social";
import { PickCard } from "@/components/pick-card";
import { Badge } from "@/components/ui/badge";
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
 * `before` null is the first chunk: any upcoming days already out, then
 * today, then the days before it. The page
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
  sportFilter = null,
  before,
}: {
  auth: AuthContext;
  tab: BoardTab;
  category: PickCategory;
  /** The pill under the tabs: only this league's (or sport's) picks and tickets. */
  sportFilter?: SportFilter | null;
  before: string | null;
}): Promise<{ node: React.ReactNode; next: string | null; todayPicks: number }> {
  const today = slateDateString();
  const isParlayTab = tab === "parlay";
  const isCommunityTab = tab === "community";

  // The sport pill, as SQL on picks — so a day with no MLB props is not
  // listed under MLB at all, as a day with no props isn't listed on Props.
  const pickFilterSql = sportFilter
    ? sql` and ${picksTable.sport} = ${sportFilter.sport}${sportFilter.league ? sql` and ${picksTable.league} = ${sportFilter.league}` : sql``}`
    : sql``;
  // Parlays match if any leg is in it.
  const ticketMatches = (pl: ParlayView) => pl.legs.some((l) => matchesSportFilter(sportFilter, l));

  // Which dates have something on this tab, in a date window: published
  // slates (plus drafts for admins) with this tab's picks or Oobee parlays, or
  // for Community the days anyone shared a parlay. Newest first.
  const datesWhere = (window: { gt?: string; lt?: string; lte?: string }, limit?: number) => {
    const col = isCommunityTab ? parlaysTable.slateDate : slates.date;
    const bounds = [
      window.gt ? gt(col, window.gt) : undefined,
      window.lt ? lt(col, window.lt) : undefined,
      window.lte ? lte(col, window.lte) : undefined,
    ];
    const q = isCommunityTab
      ? db
          .selectDistinct({ date: parlaysTable.slateDate })
          .from(parlaysTable)
          .where(and(eq(parlaysTable.shared, true), ...bounds))
          .orderBy(desc(parlaysTable.slateDate))
      : db
          .select({ date: slates.date })
          .from(slates)
          .where(
            and(
              ...bounds,
              auth.isAdmin ? undefined : sql`${slates.publishedAt} is not null`,
              isParlayTab
                ? sql`exists (select 1 from ${parlaysTable} where ${parlaysTable.slateDate} = ${slates.date} and ${parlaysTable.ownerId} is null)`
                : sql`exists (select 1 from ${picksTable} where ${picksTable.slateDate} = ${slates.date} and ${picksTable.category} = ${category}${pickFilterSql})`,
            ),
          )
          .orderBy(desc(slates.date));
    return (limit ? q.limit(limit) : q).then((rows) => rows.map((r) => r.date));
  };

  // The first chunk opens with every upcoming day that's already out —
  // furthest first, so the whole board reads newest to oldest — then today.
  // Upcoming days sit outside the paging, so however many there are, today
  // is never pushed out of the first chunk.
  const [upcoming, found] = await Promise.all([
    before === null ? datesWhere({ gt: today }) : Promise.resolve([] as string[]),
    datesWhere(before ? { lt: before } : { lte: today }, DAYS_PER_CHUNK + 1),
  ]);
  // Today always leads the past, so there is somewhere to say "nothing yet".
  const withToday = before === null && !found.includes(today) ? [today, ...found] : found;
  const past = withToday.slice(0, DAYS_PER_CHUNK);
  const days = [...upcoming, ...past];
  const next = withToday.length > DAYS_PER_CHUNK || found.length > DAYS_PER_CHUNK ? past.at(-1)! : null;

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
          .where(
            and(
              inArray(picksTable.slateDate, visibleDays),
              eq(picksTable.category, category),
              sportFilter ? eq(picksTable.sport, sportFilter.sport) : undefined,
              sportFilter?.league ? eq(picksTable.league, sportFilter.league) : undefined,
            ),
          )
          .orderBy(asc(picksTable.rank))
      : [];
  // Admins preview whole slates; everyone else sees each day's top VISIBLE_PICKS.
  // Which picks a viewer sees is decided by rank; the order they're listed in
  // is by kick-off, so a day reads like the schedule it is. Rank breaks ties.
  const picksOn = new Map(
    visibleDays.map((d) => [
      d,
      visiblePicks(rows.filter((r) => r.slateDate === d), auth.isAdmin).sort(
        (a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.rank - b.rank,
      ),
    ]),
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
    // By first leg's kick-off, as picks are, rank breaking ties.
    isParlayTab
      ? await Promise.all(
          visibleDays.map(async (d) => {
            const first = (pl: ParlayView) => Math.min(...pl.legs.map((l) => l.startsAt.getTime()));
            const list = (await markPlayed(await getOobeeParlays(d), auth.user.id)).sort(
              (a, b) => first(a) - first(b) || (a.rank ?? 0) - (b.rank ?? 0),
            );
            return [d, list] as const;
          }),
        )
      : [],
  );
  const communityOn = new Map<string, Awaited<ReturnType<typeof getCommunityParlays>>>(
    isCommunityTab
      ? await Promise.all(
          days.map(async (d) => {
            const list = await getCommunityParlays(d);
            const marked = await markPlayed(list.map((x) => x.parlay), auth.user.id);
            return [d, list.map((x, i) => ({ ...x, parlay: marked[i] }))] as const;
          }),
        )
      : [],
  );
  // Each shared ticket is carried by a post — its likes, replies and reposts.
  const postFor = isCommunityTab
    ? await getParlayPosts(
        [...communityOn.values()].flat().map(({ parlay }) => parlay.id),
        auth.user.id,
      )
    : new Map<string, FeedPost>();

  /* ------------------------------------------------------------- render */

  // "MLB game bets", "Soccer parlays" — the empty states name the pill.
  const what = sportFilter ? `${sportFilter.label} ` : "";

  const node = days.map((d) => {
    const isToday = d === today;
    const draft = draftOn.has(d) && auth.isAdmin;
    const dayPicks = picksOn.get(d) ?? [];

    if (isCommunityTab) {
      const list = (communityOn.get(d) ?? []).filter(({ parlay }) => ticketMatches(parlay));
      // Under a pill, a day with nothing in that sport is left out, today
      // included (see the note after this map).
      if (sportFilter && list.length === 0) return null;
      return (
        <DaySection key={d} date={d} today={today} pillsOnly>
          {list.length === 0 ? (
            <Empty>
              {isToday ? (
                <>
                  {sportFilter ? `No ${what}parlays shared today yet.` : "Nobody has shared a parlay today yet."}{" "}
                  <Link href="/community/new" className="text-brand hover:underline">
                    Build one
                  </Link>{" "}
                  and be first.
                </>
              ) : (
                `No shared ${what}parlays this day.`
              )}
            </Empty>
          ) : (
            // The same ticket as Oobee's parlays, with who built it in the
            // header where Oobee's show the sports.
            list.map(({ parlay: pl, ownerRole }) => {
              const post = postFor.get(pl.id);
              return post ? (
                <ParlayPost key={pl.id} post={{ ...post, parlay: pl }} viewerId={auth.user.id} />
              ) : (
                <ParlayCard
                  key={pl.id}
                  parlay={pl}
                  variant="row"
                  owner={{ username: pl.ownerUsername!, displayName: pl.ownerDisplayName, role: ownerRole }}
                />
              );
            })
          )}
        </DaySection>
      );
    }

    if (isParlayTab) {
      const list = (oobeeOn.get(d) ?? []).filter(ticketMatches);
      if (sportFilter && list.length === 0) return null;
      return (
        <DaySection key={d} date={d} today={today} draft={draft}>
          {list.length === 0 ? (
            <Empty>
              {isToday
                ? `No ${what}parlays up yet today — they go out with the rest of the board.`
                : `No ${what}Oobee parlays this day.`}
            </Empty>
          ) : (
            <>
              {featuredFirst(list, (pl) => pl.featured).map((pl) => (
                <ParlayCard
                  key={pl.id}
                  parlay={pl}
                  featured={pl.featured}
                  variant="row"
                  // Oobee's tickets can be played once the day is out.
                  follow={publishedOn.has(d) ? playable(pl, null, auth.user.id) : undefined}
                />
              ))}
            </>
          )}
        </DaySection>
      );
    }

    // Pick tabs: every day leads with its featured picks (starred, a pinch
    // lighter), then the rest, each group by kick-off. Under a pill an empty
    // today is dropped too.
    if (sportFilter && dayPicks.length === 0) return null;
    return (
      <DaySection key={d} date={d} today={today} draft={draft} picks={dayPicks}>
        {dayPicks.length === 0 ? (
          <Empty>
            {isToday
              ? `No ${what}${CATEGORY_NOUN[category]}s up yet — picks go out before the first kick-off.`
              : `No ${what}${CATEGORY_NOUN[category]}s this day.`}
          </Empty>
        ) : (
          featuredFirst(dayPicks, (p) => p.featured).map((p) => (
            <PickCard key={p.id} pick={p} follow={followFor(p)} featured={p.featured} variant="row" />
          ))
        )}
      </DaySection>
    );
  });

  // Today normally stays even when empty, to say "nothing yet". Under a pill
  // that would be a row of "No NHL…" above the NHL picks on other days, so
  // empty days go — and if that leaves nothing on the first chunk, one line
  // says so instead.
  const shown = node.filter(Boolean);
  const out =
    sportFilter && before === null && shown.length === 0 ? (
      <Empty>
        No {what}
        {isParlayTab || isCommunityTab ? "parlays" : `${CATEGORY_NOUN[category]}s`} on the board yet.
      </Empty>
    ) : (
      shown
    );

  return { node: out, next, todayPicks: picksOn.get(today)?.length ?? 0 };
}

/**
 * One day of the board. The heading sticks while you scroll through that day,
 * just under the board's tab strip and sport pills (which stick under the
 * phone's top bar, or at the very top beside the sidebar), and on a day with graded picks
 * carries its record: won–lost(–push) and net units.
 */
function DaySection({
  date,
  today,
  draft,
  picks,
  pillsOnly,
  children,
}: {
  date: string;
  today: string;
  draft?: boolean;
  picks?: Pick[];
  /** On Community: only the sport pills sit above it, no tab strip. */
  pillsOnly?: boolean;
  children: React.ReactNode;
}) {
  const diff = dayDiff(today, date);
  const name = diff === 0 ? "Today" : diff === 1 ? "Yesterday" : diff === -1 ? "Tomorrow" : null;

  const settled = (picks ?? []).filter((p) => p.status !== "pending");
  const won = settled.filter((p) => p.status === "won").length;
  const lost = settled.filter((p) => p.status === "lost").length;
  const pushed = settled.filter((p) => p.status === "push").length;
  const units = settled.reduce((sum, p) => sum + pickProfit(p), 0);

  return (
    <section aria-labelledby={`day-${date}-heading`} id={`day-${date}`} className="scroll-mt-20">
      <div
        className={cn(
          "sticky z-20 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border bg-black/80 px-4 py-3 backdrop-blur-xl",
          // Under Picks' tabs and pills, or under Community's pills alone —
          // and on a phone, as those slide away with the top bar, at the top.
          pillsOnly
            ? "top-[calc(3.5rem+1px+3.5rem+var(--spacing-safe-top)-var(--chrome-hide,0px)-var(--chrome-p,0)*3.5rem)] sm:top-[3.5rem]"
            : "top-[calc(3.5rem+1px+3.0625rem+3.5rem+var(--spacing-safe-top)-var(--chrome-hide,0px)-var(--chrome-p,0)*6.5625rem)] sm:top-[6.5625rem]",
        )}
      >
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
      {children}
    </section>
  );
}

/** A day's list with its featured items moved to the front, order otherwise kept (kick-off). */
function featuredFirst<T>(items: T[], isFeatured: (t: T) => boolean): T[] {
  return [...items.filter(isFeatured), ...items.filter((t) => !isFeatured(t))];
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="border-b border-border px-4 py-8 text-center text-sm text-fg-muted">{children}</p>;
}
