import "server-only";
import { and, asc, desc, eq, gt, inArray, lt, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { parlays as parlaysTable, pickFollows, picks as picksTable, slates } from "@/db/schema";
import type { Pick, PickCategory } from "@/db/schema";
import type { AuthContext } from "@/lib/auth";
import { CATEGORY_NOUN, ONLY_SPORT, matchesSportFilter, visiblePicks, type BoardTab, type SportFilter } from "@/lib/board";
import { leadGameDay } from "@/lib/odds/board";
import { getOobeeParlays, markPlayed, type ParlayView } from "@/lib/parlay-store";
import { followWindowOpen, type ViewerFollow } from "@/lib/follows";
import { pickProfit } from "@/lib/settlement";
import { slateDateString } from "@/lib/slate-date";
import { formatSlateDate, formatSlateWeekday } from "@/lib/i18n/format";
import { ParlayCard } from "@/components/parlay-card";
import { playable } from "@/components/social/parlay-row";
import { PickCard } from "@/components/pick-card";
import { Badge } from "@/components/ui/badge";
import { viewerAccess } from "@/lib/billing/access";
import { tierForRank } from "@/lib/tiers";
import { UnlockRow } from "@/components/billing/unlock-row";
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
 * today (or, on a day without games, the next game day), then the days before
 * it. The page
 * renders that one; the infinite-scroll action renders the rest, so both come
 * from this one function and look the same.
 *
 * Only days with something on this tab are listed, so a slate with no props
 * never leaves an empty "Player props" day behind: published slates (plus
 * drafts for admins) carrying this tab's picks or Oobee parlays. Community
 * pages by ticket rather than by day — see community/community-feed.tsx.
 */
export async function loadBoardDays({
  auth,
  tab,
  category,
  sportFilter = null,
  before,
}: {
  auth: AuthContext;
  tab: Exclude<BoardTab, "community">;
  category: PickCategory;
  /** The pill under the tabs: only this league's (or sport's) picks and tickets. */
  sportFilter?: SportFilter | null;
  before: string | null;
}): Promise<{ node: React.ReactNode; next: string | null; todayPicks: number }> {
  const today = slateDateString();
  const isParlayTab = tab === "parlay";
  // How deep into each list this viewer's plan reaches (lib/tiers.ts).
  const { access, rule } = await viewerAccess(auth);

  // The sport pill, as SQL on picks — so a day with no MLB props is not
  // listed under MLB at all, as a day with no props isn't listed on Props.
  const pickFilterSql = sportFilter
    ? sql` and ${picksTable.sport} = ${sportFilter.sport}${sportFilter.league ? sql` and ${picksTable.league} = ${sportFilter.league}` : sql``}`
    : sql``;
  // Parlays match if any leg is in it.
  const ticketMatches = (pl: ParlayView) => pl.legs.some((l) => matchesSportFilter(sportFilter, l));

  // Which dates have something on this tab, in a date window: published
  // slates (plus drafts for admins) with this tab's picks or Oobee parlays.
  // Newest first.
  const datesWhere = (window: { gt?: string; lt?: string; lte?: string }, limit?: number) => {
    const q = db
      .select({ date: slates.date })
      .from(slates)
      .where(
        and(
          window.gt ? gt(slates.date, window.gt) : undefined,
          window.lt ? lt(slates.date, window.lt) : undefined,
          window.lte ? lte(slates.date, window.lte) : undefined,
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
  // The first chunk always has a day to say "nothing yet" under: today, or on
  // a day without games the next game day (unless its board is already out,
  // above).
  const lead = before === null && !found.includes(today) ? await leadGameDay(today) : null;
  const leadDay = lead ?? today;
  const withToday = lead === today ? [today, ...found] : found;
  const ahead = lead && lead !== today && !upcoming.includes(lead) ? [...upcoming, lead].sort().reverse() : upcoming;
  const past = withToday.slice(0, DAYS_PER_CHUNK);
  const days = [...ahead, ...past];
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
    !isParlayTab && visibleDays.length
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
  //
  // A plan only holds back picks that are still open. Once one is settled it
  // is history, not a tip — and the record being there for anyone to check,
  // losses included, is the whole pitch — so every viewer sees how it went.
  const picksOn = new Map(
    visibleDays.map((d) => {
      const day = rows.filter((r) => r.slateDate === d);
      const open = new Set(visiblePicks(day, auth.isAdmin, rule.picks));
      return [
        d,
        day
          .filter((p) => open.has(p) || p.status !== "pending")
          .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.rank - b.rank),
      ];
    }),
  );
  const shownPicks = [...picksOn.values()].flat();
  // Open picks on a day the plan doesn't reach — counted, never sent. Only on
  // a plan (billing on); admins and the free beta have nothing held back.
  const lockedOn = (d: string) =>
    access ? rows.filter((r) => r.slateDate === d).length - (picksOn.get(d)?.length ?? 0) : 0;

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
    isParlayTab && rule.parlays
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

  /* ------------------------------------------------------------- render */

  // "MLB game bets", "Soccer parlays" — the empty states name the pill.
  const what = sportFilter ? `${sportFilter.label} ` : "";
  // A pill someone chose drops empty days. With one sport there is no pill
  // row, only the default, and the lead day has to stay to say "nothing yet".
  const narrowed = sportFilter !== null && sportFilter !== ONLY_SPORT;

  const node = days.map((d) => {
    const isToday = d === today;
    // The day without its board yet: today, or the next game day.
    const isLead = d === leadDay;
    const draft = draftOn.has(d) && auth.isAdmin;
    const dayPicks = picksOn.get(d) ?? [];

    if (isParlayTab && !rule.parlays) {
      // The lead day only: one prompt, not one under every past day.
      if (!isLead) return null;
      return (
        <DaySection key={d} date={d} today={today} draft={draft}>
          <UnlockRow tier="pro" what="Oobee's parlays" />
        </DaySection>
      );
    }

    if (isParlayTab) {
      const list = (oobeeOn.get(d) ?? []).filter(ticketMatches);
      if (narrowed && list.length === 0) return null;
      return (
        <DaySection key={d} date={d} today={today} draft={draft} count={countLabel(list.length, "parlay")}>
          {list.length === 0 ? (
            <Empty>
              {isLead && !isToday
                ? `No ${what}games today. Oobee's ${formatSlateWeekday(d)} parlays go out with the rest of the board.`
                : isToday
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
    const locked = lockedOn(d);
    if (narrowed && dayPicks.length === 0 && locked === 0) return null;
    return (
      <DaySection
        key={d}
        date={d}
        today={today}
        draft={draft}
        picks={dayPicks}
        // Held-back picks count too: the row under the list names them.
        count={countLabel(dayPicks.length + locked, CATEGORY_NOUN[category])}
      >
        {dayPicks.length === 0 && locked === 0 ? (
          <Empty>
            {isLead && !isToday
              ? `No ${what}games today. ${formatSlateWeekday(d)}'s ${CATEGORY_NOUN[category]}s go out before the first kick-off.`
              : isToday
                ? `No ${what}${CATEGORY_NOUN[category]}s up yet — picks go out before the first kick-off.`
                : `No ${what}${CATEGORY_NOUN[category]}s this day.`}
          </Empty>
        ) : (
          featuredFirst(dayPicks, (p) => p.featured).map((p) => (
            <PickCard key={p.id} pick={p} follow={followFor(p)} featured={p.featured} variant="row" />
          ))
        )}
        {locked > 0 && (
          <UnlockRow
            tier={tierForRank(category, rule.picks[category] + 1) ?? "elite"}
            what={`${locked} more ${CATEGORY_NOUN[category]}${locked === 1 ? "" : "s"}`}
          />
        )}
      </DaySection>
    );
  });

  // The lead day normally stays even when empty, to say "nothing yet". Under
  // a pill that would be a row of "No NHL…" above the NHL picks on other days,
  // so empty days go — and if that leaves nothing on the first chunk, one line
  // says so instead.
  const shown = node.filter(Boolean);
  const out =
    narrowed && before === null && shown.length === 0 ? (
      <Empty>
        No {what}
        {isParlayTab ? "parlays" : `${CATEGORY_NOUN[category]}s`} on the board yet.
      </Empty>
    ) : (
      shown
    );

  return { node: out, next, todayPicks: picksOn.get(today)?.length ?? 0 };
}

/**
 * One day of the board. The heading sticks while you scroll through that day,
 * just under the board's tab strip and sport pills (which stick under the
 * phone's top bar, or at the very top beside the sidebar).
 */
function DaySection({
  date,
  today,
  draft,
  picks,
  count,
  children,
}: {
  date: string;
  today: string;
  draft?: boolean;
  picks?: Pick[];
  count?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={`day-${date}-heading`} id={`day-${date}`} className="scroll-mt-20">
      <DayHeading
        date={date}
        today={today}
        draft={draft}
        picks={picks}
        count={count}
        className="top-[calc(3.5rem+1px+3.0625rem+3.5rem+var(--spacing-safe-top)-var(--chrome-hide,0px)-var(--chrome-p,0)*6.5625rem)] bg-black/80 backdrop-blur-xl sm:top-[6.5625rem]"
      />
      {children}
    </section>
  );
}

/**
 * A day's sticky heading — "Today · Mon, Oct 13" — and, on a day with graded
 * picks, its record: won–lost(–push) and net units. Where it sticks is the
 * caller's, since that depends on what sits above it.
 */
export function DayHeading({
  date,
  today,
  draft,
  picks,
  count,
  className,
}: {
  date: string;
  today: string;
  draft?: boolean;
  picks?: Pick[];
  /** "12 game bets" — how much is on this day, beside its date. */
  count?: string;
  className: string;
}) {
  const diff = dayDiff(today, date);
  const name = diff === 0 ? "Today" : diff === 1 ? "Yesterday" : diff === -1 ? "Tomorrow" : null;

  const settled = (picks ?? []).filter((p) => p.status !== "pending");
  const won = settled.filter((p) => p.status === "won").length;
  const lost = settled.filter((p) => p.status === "lost").length;
  const pushed = settled.filter((p) => p.status === "push").length;
  const units = settled.reduce((sum, p) => sum + pickProfit(p), 0);

  return (
    <div
      className={cn(
        "sticky z-20 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border px-4 py-3",
        className,
      )}
    >
      <h2 id={`day-${date}-heading`} className="flex items-baseline gap-2 text-base font-semibold tracking-tight">
        {name && <span>{name}</span>}
        <span className={cn("num", name ? "text-sm font-normal text-fg-muted" : "")}>{formatSlateDate(date)}</span>
        {count && (
          <span className="num text-sm font-normal text-fg-subtle">
            <span className="mr-2" aria-hidden="true">·</span>
            {count}
          </span>
        )}
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
  );
}

/** "1 game bet", "12 player props" — nothing on an empty day, whose empty state already says so. */
function countLabel(n: number, noun: string): string | undefined {
  return n > 0 ? `${n} ${noun}${n === 1 ? "" : "s"}` : undefined;
}

/** A day's list with its featured items moved to the front, order otherwise kept (kick-off). */
function featuredFirst<T>(items: T[], isFeatured: (t: T) => boolean): T[] {
  return [...items.filter(isFeatured), ...items.filter((t) => !isFeatured(t))];
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="border-b border-border px-4 py-8 text-center text-sm text-fg-muted">{children}</p>;
}
