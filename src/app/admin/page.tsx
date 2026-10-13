import Link from "next/link";
import { and, desc, eq, sql } from "drizzle-orm";
import { CircleCheck, CirclePlus } from "lucide-react";
import { db } from "@/db";
import { auditLog, picks, slates, users } from "@/db/schema";
import { StatTile } from "@/components/stat-tile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdminPage } from "@/lib/auth";
import { getTrackRecord } from "@/lib/stats";
import {
  CATEGORY_LABELS,
  PICKS_PER_SLATE,
  TOTAL_PICKS_PER_SLATE,
  pickCategories,
  type PickCategory,
} from "@/lib/board";
import { slateDateString } from "@/lib/slate-date";
import type { Metadata } from "next";
import { formatDateTime, formatSlateDate, formatUnits } from "@/lib/i18n/format";

export const metadata: Metadata = { title: "Overview" };

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  await requireAdminPage();
  const today = slateDateString();

  const [record, todaySlate, counts, awaiting, recentAudit] = await Promise.all([
    getTrackRecord(),
    db.select().from(slates).where(eq(slates.date, today)).limit(1),
    db
      .select({ category: picks.category, n: sql<number>`count(*)::int` })
      .from(picks)
      .where(eq(picks.slateDate, today))
      .groupBy(picks.category),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(picks)
      .where(and(eq(picks.status, "pending"), sql`${picks.startsAt} < now()`)),
    db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(8),
  ]);

  const [{ n: userCount }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(users);

  const slate = todaySlate[0];
  const byCategory = Object.fromEntries(
    pickCategories.map((c) => [c, counts.find((r) => r.category === c)?.n ?? 0]),
  ) as Record<PickCategory, number>;
  const pickCount = counts.reduce((n, r) => n + r.n, 0);
  const toSettle = awaiting[0]?.n ?? 0;

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
      <p className="mt-1.5 text-sm text-fg-muted">
        {formatSlateDate(today)} &middot; slate day boundary 04:00 ET
      </p>

      {/* ------------------------------------------------------- daily jobs */}
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <Card className={slate?.publishedAt ? "border-hit/25" : "border-pending/30"}>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Today&apos;s slate</CardTitle>
              {slate?.publishedAt ? (
                <Badge variant="hit">Published</Badge>
              ) : (
                <Badge variant="pending">{pickCount > 0 ? "Draft" : "Empty"}</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <p className="num text-3xl font-semibold">
              {pickCount}
              <span className="text-base text-fg-subtle">/{TOTAL_PICKS_PER_SLATE}</span>
            </p>
            <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-fg-subtle">
              {pickCategories.map((c) => (
                <span key={c}>
                  {CATEGORY_LABELS[c]}{" "}
                  <span className="num">
                    {byCategory[c]}/{PICKS_PER_SLATE[c]}
                  </span>
                </span>
              ))}
            </p>
            <p className="mt-1 text-sm text-fg-muted">
              {slate?.publishedAt
                ? "Live to everyone."
                : pickCount === 0
                  ? "Nothing added yet today."
                  : "Not published — testers can't see these."}
            </p>
            <Button className="mt-4" size="sm" asChild>
              <Link href="/admin/slate">
                <CirclePlus aria-hidden="true" />
                {pickCount === 0 ? "Build the slate" : "Continue"}
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className={toSettle > 0 ? "border-brand/30" : undefined}>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Waiting to settle</CardTitle>
              {toSettle > 0 && <Badge variant="brand">{toSettle} due</Badge>}
            </div>
          </CardHeader>
          <CardContent>
            <p className="num text-3xl font-semibold">{toSettle}</p>
            <p className="mt-1 text-sm text-fg-muted">
              {toSettle > 0
                ? "Games have finished but the result isn't in."
                : "Everything that started is graded."}
            </p>
            <Button
              className="mt-4"
              size="sm"
              variant={toSettle > 0 ? "default" : "outline"}
              asChild
            >
              <Link href="/admin/settle">
                <CircleCheck aria-hidden="true" />
                Settle picks
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* ------------------------------------------------------------ stats */}
      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <StatTile label="Registered users" value={userCount} />
        <StatTile
          label="Net units (all time)"
          tone={record.netUnits >= 0 ? "hit" : "miss"}
          value={formatUnits(record.netUnits)}
        />
        <StatTile
          label="Record"
          value={`${record.wins}–${record.losses}`}
          sub={record.sampleTooSmall ? "Too few for a rate" : undefined}
        />
      </dl>

      {/* ---------------------------------------------------- recent activity */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
        </CardHeader>
        <CardContent>
          {recentAudit.length === 0 ? (
            <p className="text-sm text-fg-muted">Nothing logged yet.</p>
          ) : (
            <ul className="space-y-2.5">
              {recentAudit.map((a) => (
                <li key={a.id} className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="truncate text-fg-muted">
                    <span className="text-fg">{a.action}</span>
                    {a.actorEmail ? ` · ${a.actorEmail}` : ""}
                  </span>
                  <time
                    dateTime={a.createdAt.toISOString()}
                    className="num shrink-0 text-fg-subtle"
                  >
                    {formatDateTime(a.createdAt)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
