import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { picks, slates } from "@/db/schema";
import { PickComposer } from "@/components/admin/pick-composer";
import { SlatePickList } from "@/components/admin/slate-pick-list";
import { PublishBar } from "@/components/admin/publish-bar";
import { isValidSlateDate, slateDateString } from "@/lib/slate-date";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Publish slate" };

export const dynamic = "force-dynamic";

export default async function AdminSlatePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  const date =
    params.date && isValidSlateDate(params.date) ? params.date : slateDateString();

  const [slateRow, rows] = await Promise.all([
    db.select().from(slates).where(eq(slates.date, date)).limit(1),
    db.select().from(picks).where(eq(picks.slateDate, date)).orderBy(asc(picks.rank)),
  ]);

  const slate = slateRow[0] ?? null;
  const published = Boolean(slate?.publishedAt);
  const usedRanks = rows.map((r) => r.rank);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Publish slate</h1>
      <p className="mt-1.5 text-sm text-fg-muted">
        Add picks in rank order. Rank 1 is the best play of the day and is free to
        everyone; 1&ndash;6 is Base, 1&ndash;15 Pro, all 30 Elite.
      </p>

      <PublishBar
        date={date}
        published={published}
        pickCount={rows.length}
        anySettled={rows.some((r) => r.settledAt !== null)}
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-32 lg:self-start">
          <PickComposer date={date} usedRanks={usedRanks} disabled={published} />
        </div>
        <SlatePickList picks={rows} published={published} />
      </div>
    </div>
  );
}
