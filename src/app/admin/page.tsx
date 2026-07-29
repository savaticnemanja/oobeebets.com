import Link from "next/link";
import { and, desc, eq, sql } from "drizzle-orm";
import { ArrowRight, CircleCheck, CirclePlus, Users } from "lucide-react";
import { db } from "@/db";
import { auditLog, picks, slates, subscriptions, users } from "@/db/schema";
import { StatTile } from "@/components/stat-tile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSeatUsage } from "@/lib/settings";
import { getTrackRecord } from "@/lib/stats";
import { slateDateString, formatSlateDate } from "@/lib/slate-date";
import { formatUnits } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const today = slateDateString();

  const [seats, record, todaySlate, counts, awaiting, recentAudit, subCounts] =
    await Promise.all([
      getSeatUsage(),
      getTrackRecord(),
      db.select().from(slates).where(eq(slates.date, today)).limit(1),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(picks)
        .where(eq(picks.slateDate, today)),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(picks)
        .where(and(eq(picks.status, "pending"), sql`${picks.startsAt} < now()`)),
      db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(8),
      db
        .select({ tier: subscriptions.tier, n: sql<number>`count(*)::int` })
        .from(subscriptions)
        .where(sql`${subscriptions.status} in ('trialing','active','past_due')`)
        .groupBy(subscriptions.tier),
    ]);

  const [{ n: userCount }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(users);

  const slate = todaySlate[0];
  const pickCount = counts[0]?.n ?? 0;
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
            <p className="num text-3xl font-semibold">{pickCount}<span className="text-base text-fg-subtle">/30</span></p>
            <p className="mt-1 text-sm text-fg-muted">
              {slate?.publishedAt
                ? "Live to subscribers."
                : pickCount === 0
                  ? "Nothing added yet today."
                  : "Not published — subscribers can't see these."}
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
      <dl className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Seats taken"
          value={`${seats.taken}/${seats.cap}`}
          tone={seats.left === 0 ? "miss" : "brand"}
          sub={`${seats.left} left`}
        />
        <StatTile label="Registered users" value={userCount} />
        <StatTile
          label="Net units (all time)"
          tone={record.overall.netUnits >= 0 ? "hit" : "miss"}
          value={formatUnits(record.overall.netUnits)}
        />
        <StatTile
          label="Record"
          value={`${record.overall.wins}–${record.overall.losses}`}
          sub={record.overall.sampleTooSmall ? "Too few for a rate" : undefined}
        />
      </dl>

      {/* ------------------------------------------------------ tier split */}
      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="size-4 text-fg-subtle" aria-hidden="true" />
              Live subscriptions
            </CardTitle>
          </CardHeader>
          <CardContent>
            {subCounts.length === 0 ? (
              <p className="text-sm text-fg-muted">No live subscriptions yet.</p>
            ) : (
              <ul className="space-y-2">
                {subCounts.map((s) => (
                  <li key={s.tier} className="flex items-center justify-between text-sm">
                    <span className="capitalize text-fg-muted">{s.tier}</span>
                    <span className="num font-semibold text-fg">{s.n}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
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
                      {a.createdAt.toLocaleString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </li>
                ))}
              </ul>
            )}
            <Button variant="link" className="mt-4" asChild>
              <Link href="/admin/settings">
                Settings <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
