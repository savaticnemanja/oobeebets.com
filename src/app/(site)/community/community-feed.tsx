import "server-only";
import { Fragment } from "react";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { parlays } from "@/db/schema";
import type { AuthContext } from "@/lib/auth";
import { ONLY_SPORT, type SportFilter } from "@/lib/board";
import { LEAGUE_CONFIG } from "@/lib/odds/markets";
import { getCommunityParlayPage, markPlayed } from "@/lib/parlay-store";
import { getParlayPosts } from "@/lib/social";
import { slateDateString } from "@/lib/slate-date";
import { ParlayCard } from "@/components/parlay-card";
import { ParlayPost } from "@/components/social/parlay-row";
import { DayHeading, Empty } from "../picks/board-days";

/** Tickets per chunk. A ticket is tall, so fewer than Home's posts. */
const PARLAYS_PER_CHUNK = 12;

/**
 * One chunk of Community: the next dozen shared tickets, newest day first,
 * under day headings — loaded as you scroll, the way Home loads posts, rather
 * than a whole day at a time. A chunk can stop mid-day; the next one then
 * carries on under the heading already on screen instead of repeating it.
 *
 * That is also why the headings are not wrapped in a section per day, as on
 * Picks: a sticky heading only sticks inside its parent, and a day split
 * across two chunks would have two. As flat siblings in the column, each
 * heading sticks until the next day's slides up over it — so they are solid,
 * not see-through, or the one underneath would show.
 *
 * `before` is the last ticket shown, null for the first chunk.
 */
export async function loadCommunityChunk({
  auth,
  sportFilter,
  before,
}: {
  auth: AuthContext;
  sportFilter: SportFilter | null;
  before: string | null;
}): Promise<{ node: React.ReactNode; next: string | null }> {
  const today = slateDateString();
  const leagues = sportFilter
    ? sportFilter.league
      ? [sportFilter.league]
      : Object.entries(LEAGUE_CONFIG)
          .filter(([, c]) => c.sport === sportFilter.sport)
          .map(([league]) => league)
    : [];

  const [page, prev] = await Promise.all([
    getCommunityParlayPage({ before, sport: sportFilter, leagues, limit: PARLAYS_PER_CHUNK, viewerId: auth.user.id }),
    before
      ? db.select({ date: parlays.slateDate }).from(parlays).where(eq(parlays.id, before)).limit(1)
      : Promise.resolve([]),
  ]);
  const played = await markPlayed(
    page.items.map((x) => x.parlay),
    auth.user.id,
  );
  // Each shared ticket is carried by a post — its likes, replies and reposts.
  const postFor = await getParlayPosts(
    played.map((p) => p.id),
    auth.user.id,
  );

  const what = sportFilter ? `${sportFilter.label} ` : "";
  const heading = (date: string) => (
    <DayHeading
      key={`day-${date}`}
      date={date}
      today={today}
      className="top-[calc(3.5rem+1px+3.5rem+var(--spacing-safe-top)-var(--chrome-hide,0px)-var(--chrome-p,0)*3.5rem)] bg-black sm:top-[3.5rem]"
    />
  );
  // Today always has a place between the upcoming days and the past, so
  // there is somewhere to say nobody has shared one yet — except under a
  // pill, where a row of "No NHL…" would just be noise.
  const todayEmpty = (
    <Fragment key="today-empty">
      {heading(today)}
      <Empty>
        Nobody has shared a parlay today yet.{" "}
        <Link href="/community/new" className="text-brand hover:underline">
          Build one
        </Link>{" "}
        and be first.
      </Empty>
    </Fragment>
  );

  const out: React.ReactNode[] = [];
  // The day the previous chunk ended on: its heading is still on screen.
  let lastDate: string | null = prev[0]?.date ?? null;
  // A pill someone chose — not the one sport there is while there's one.
  const picked = sportFilter !== null && sportFilter !== ONLY_SPORT;
  const passedToday = (d: string | null) => !picked && (lastDate === null || lastDate > today) && (d === null || d < today);

  page.items.forEach(({ parlay, ownerRole }, i) => {
    const d = parlay.slateDate;
    if (passedToday(d)) {
      out.push(todayEmpty);
      lastDate = today;
    }
    if (d !== lastDate) out.push(heading(d));
    lastDate = d;
    const pl = played[i];
    const post = postFor.get(pl.id);
    out.push(
      post ? (
        <ParlayPost key={pl.id} post={{ ...post, parlay: pl }} viewerId={auth.user.id} isAdmin={auth.isAdmin} />
      ) : (
        // The same ticket as Oobee's parlays, with who built it in the
        // header where Oobee's show the sports.
        <ParlayCard
          key={pl.id}
          parlay={pl}
          variant="row"
          owner={{ username: pl.ownerUsername!, displayName: pl.ownerDisplayName, avatarId: pl.ownerAvatarId, role: ownerRole }}
        />
      ),
    );
  });
  // The last chunk: if every day so far was upcoming, today still comes last.
  if (!page.next && passedToday(null)) out.push(todayEmpty);

  if (before === null && page.items.length === 0 && picked) {
    return { node: <Empty>No {what}parlays shared yet.</Empty>, next: null };
  }
  return { node: out, next: page.next };
}
