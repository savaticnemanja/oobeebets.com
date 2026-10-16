import Link from "next/link";
import { count, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Metadata } from "next";
import { db } from "@/db";
import { reports, users } from "@/db/schema";
import { ReportActions } from "@/components/admin/report-actions";
import { LocalTime } from "@/components/local-time";
import { Badge } from "@/components/ui/badge";
import { requireAdminPage } from "@/lib/auth";
import { REPORT_REASON_LABEL } from "@/lib/report-reasons";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Reports" };

export const dynamic = "force-dynamic";

const LIMIT = 200;

/**
 * What testers reported from a post's or a profile's ⋯ menu. Each shows who
 * was reported and why, the post as it was when reported (kept even once
 * it's removed), and the two answers: remove the post, or dismiss.
 */
export default async function AdminReportsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const [, params] = await Promise.all([requireAdminPage(), searchParams]);
  const showResolved = params.show === "resolved";

  const reporter = alias(users, "reporter");
  const target = alias(users, "target");
  const [rows, [{ open }], [{ resolved }]] = await Promise.all([
    db
      .select({
        id: reports.id,
        postId: reports.postId,
        postBody: reports.postBody,
        reason: reports.reason,
        note: reports.note,
        outcome: reports.outcome,
        createdAt: reports.createdAt,
        resolvedAt: reports.resolvedAt,
        reporter: reporter.username,
        target: target.username,
      })
      .from(reports)
      .leftJoin(reporter, eq(reporter.id, reports.reporterId))
      .leftJoin(target, eq(target.id, reports.targetUserId))
      .where(showResolved ? isNotNull(reports.resolvedAt) : isNull(reports.resolvedAt))
      .orderBy(desc(showResolved ? reports.resolvedAt : reports.createdAt))
      .limit(LIMIT),
    db.select({ open: count() }).from(reports).where(isNull(reports.resolvedAt)),
    db.select({ resolved: count() }).from(reports).where(isNotNull(reports.resolvedAt)),
  ]);

  const tabs = [
    { href: "/admin/reports", label: "Open", n: open, active: !showResolved },
    { href: "/admin/reports?show=resolved", label: "Resolved", n: resolved, active: showResolved },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
      <p className="mt-1.5 text-sm text-fg-muted">
        Posts and accounts testers reported. Remove a post that breaks the Terms, or dismiss the report.
      </p>

      <nav aria-label="Report lists" className="mt-6 flex gap-2">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={tab.active ? "page" : undefined}
            className={cn(
              "rounded-lg border px-3 py-2 text-sm transition-colors",
              tab.active ? "border-brand/50 bg-brand/10 text-brand" : "border-border text-fg-muted hover:border-border-strong hover:text-fg",
            )}
          >
            {tab.label} <span className="num">{tab.n}</span>
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <p className="mt-8 text-sm text-fg-muted">{showResolved ? "Nothing resolved yet." : "No open reports."}</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="card-hairline p-4" data-report-id={r.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="miss">{REPORT_REASON_LABEL[r.reason]}</Badge>
                    <span className="text-fg">
                      {r.postBody !== null ? "Post by " : "Account "}
                      {r.target ? (
                        <Link href={`/u/${r.target}`} className="font-medium hover:underline">
                          @{r.target}
                        </Link>
                      ) : (
                        <span className="text-fg-subtle">a deleted account</span>
                      )}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-fg-subtle">
                    Reported by {r.reporter ? `@${r.reporter}` : "a deleted account"} · <LocalTime at={r.createdAt} format="datetime" />
                    {r.resolvedAt && (
                      <>
                        {" "}· {r.outcome === "removed" ? "post removed" : "dismissed"} <LocalTime at={r.resolvedAt} format="datetime" />
                      </>
                    )}
                  </p>
                </div>
                {!r.resolvedAt && <ReportActions reportId={r.id} canRemove={r.postId !== null} />}
              </div>

              {r.postBody !== null && (
                <blockquote className="mt-3 rounded-xl border border-border px-3 py-2 text-sm text-fg">
                  {r.postBody || <span className="text-fg-subtle">(no text — a shared parlay)</span>}
                  {r.postId && (
                    <Link href={`/p/${r.postId}`} className="mt-1 block text-xs text-brand hover:underline">
                      Open the post
                    </Link>
                  )}
                </blockquote>
              )}
              {r.note && <p className="mt-2 text-sm text-fg-muted">&ldquo;{r.note}&rdquo;</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
