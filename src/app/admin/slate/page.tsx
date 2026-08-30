import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { picks, slates } from "@/db/schema";
import { PickComposer } from "@/components/admin/pick-composer";
import { SlatePickList } from "@/components/admin/slate-pick-list";
import { PublishBar } from "@/components/admin/publish-bar";
import { isValidSlateDate, slateDateString } from "@/lib/slate-date";
import {
  CATEGORY_LABELS,
  PICKS_PER_SLATE,
  categoryFromParam,
  pickCategories,
  type PickCategory,
} from "@/lib/board";
import { cn } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Publish slate" };

export const dynamic = "force-dynamic";

export default async function AdminSlatePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; category?: string }>;
}) {
  const params = await searchParams;
  const date =
    params.date && isValidSlateDate(params.date) ? params.date : slateDateString();
  const category = categoryFromParam(params.category);

  const [slateRow, rows] = await Promise.all([
    db.select().from(slates).where(eq(slates.date, date)).limit(1),
    db.select().from(picks).where(eq(picks.slateDate, date)).orderBy(asc(picks.rank)),
  ]);

  const slate = slateRow[0] ?? null;
  const published = Boolean(slate?.publishedAt);

  // One query for the day, split here. Both counts are needed for the publish
  // bar regardless of which tab is open, so fetching per-tab would mean two
  // round trips to render one screen.
  const byCategory = Object.fromEntries(
    pickCategories.map((c) => [c, rows.filter((r) => r.category === c)]),
  ) as Record<PickCategory, typeof rows>;

  const counts = Object.fromEntries(
    pickCategories.map((c) => [c, byCategory[c].length]),
  ) as Record<PickCategory, number>;

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Publish slate</h1>
      <p className="mt-1.5 text-sm text-fg-muted">
        Two boards, ranked separately — rank 1 is the best play on its own tab. Add
        picks in any order, then drag rows below to set the final rank. All{" "}
        {PICKS_PER_SLATE.game} game bets and {PICKS_PER_SLATE.prop} player props go
        out free to every tester, and both publish together.
      </p>

      <PublishBar
        date={date}
        category={category}
        published={published}
        counts={counts}
        anySettled={rows.some((r) => r.settledAt !== null)}
      />

      {/* ---------------------------------------------------------- category */}
      <nav
        aria-label="Board"
        className="mt-6 -mb-px flex items-center gap-1 border-b border-border"
      >
        {pickCategories.map((c) => {
          const isActive = c === category;
          return (
            <Link
              key={c}
              href={`/admin/slate?date=${date}&category=${c}`}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "relative inline-flex items-center gap-2 px-3 py-2.5 text-sm font-medium transition-colors",
                isActive ? "text-brand" : "text-fg-muted hover:text-fg",
              )}
            >
              {CATEGORY_LABELS[c]}
              <span className="num text-xs text-fg-subtle">
                {counts[c]}/{PICKS_PER_SLATE[c]}
              </span>
              {isActive && (
                <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-brand" />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-32 lg:self-start">
          <PickComposer
            date={date}
            category={category}
            pickCount={counts[category]}
            disabled={published}
          />
        </div>
        <SlatePickList
          date={date}
          category={category}
          picks={byCategory[category]}
          published={published}
        />
      </div>
    </div>
  );
}
