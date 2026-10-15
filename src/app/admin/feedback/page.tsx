import Link from "next/link";
import { count, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Metadata } from "next";
import { db } from "@/db";
import { feedback, users } from "@/db/schema";
import { FeedbackResolve } from "@/components/admin/feedback-resolve";
import { LocalTime } from "@/components/local-time";
import { Badge } from "@/components/ui/badge";
import { requireAdminPage } from "@/lib/auth";
import { FEEDBACK_KIND_LABELS } from "@/lib/validation";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Feedback" };

export const dynamic = "force-dynamic";

const KIND_BADGE = { bug: "miss", idea: "brand", other: "default" } as const;

/** The newest this many per list; resolve the old ones to see further back. */
const LIMIT = 200;

export default async function AdminFeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const [, params] = await Promise.all([requireAdminPage(), searchParams]);
  const showResolved = params.show === "resolved";

  const resolver = alias(users, "resolver");
  const [rows, [{ open }], [{ resolved }]] = await Promise.all([
    db
      .select({
        id: feedback.id,
        kind: feedback.kind,
        body: feedback.body,
        pagePath: feedback.pagePath,
        userAgent: feedback.userAgent,
        createdAt: feedback.createdAt,
        resolvedAt: feedback.resolvedAt,
        name: users.displayName,
        username: users.username,
        email: users.email,
        resolverEmail: resolver.email,
      })
      .from(feedback)
      .leftJoin(users, eq(users.id, feedback.userId))
      .leftJoin(resolver, eq(resolver.id, feedback.resolvedBy))
      .where(showResolved ? isNotNull(feedback.resolvedAt) : isNull(feedback.resolvedAt))
      .orderBy(desc(showResolved ? feedback.resolvedAt : feedback.createdAt))
      .limit(LIMIT),
    db.select({ open: count() }).from(feedback).where(isNull(feedback.resolvedAt)),
    db.select({ resolved: count() }).from(feedback).where(isNotNull(feedback.resolvedAt)),
  ]);

  const tabs = [
    { href: "/admin/feedback", label: "Open", n: open, active: !showResolved },
    { href: "/admin/feedback?show=resolved", label: "Resolved", n: resolved, active: showResolved },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Feedback</h1>
      <p className="mt-1.5 text-sm text-fg-muted">
        What testers send from &ldquo;Send feedback&rdquo;, newest first. Mark an item resolved
        once it&apos;s dealt with.
      </p>

      <nav aria-label="Feedback lists" className="mt-6 flex gap-2">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={tab.active ? "page" : undefined}
            className={cn(
              "rounded-lg border px-3 py-2 text-sm transition-colors",
              tab.active
                ? "border-brand/50 bg-brand/10 text-brand"
                : "border-border text-fg-muted hover:border-border-strong hover:text-fg",
            )}
          >
            {tab.label} <span className="num">{tab.n}</span>
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <p className="mt-8 text-sm text-fg-muted">
          {showResolved ? "Nothing resolved yet." : "Nothing open — all caught up."}
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {rows.map((f) => (
            <li key={f.id} className="card-hairline p-4" data-feedback-id={f.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={KIND_BADGE[f.kind]}>{FEEDBACK_KIND_LABELS[f.kind]}</Badge>
                    {f.username ? (
                      <Link href={`/u/${f.username}`} className="font-medium text-fg hover:underline">
                        {f.name ?? `@${f.username}`}
                      </Link>
                    ) : (
                      <span className="text-fg-subtle">Deleted account</span>
                    )}
                    {f.email && <span className="truncate text-fg-subtle">{f.email}</span>}
                  </div>
                  <p className="mt-1 text-xs text-fg-subtle">
                    <LocalTime at={f.createdAt} format="datetime" />
                    {f.pagePath && (
                      <>
                        {" · on "}
                        <code className="text-fg-muted">{f.pagePath}</code>
                      </>
                    )}
                  </p>
                </div>
                <FeedbackResolve id={f.id} resolved={f.resolvedAt !== null} />
              </div>

              <p className="mt-3 whitespace-pre-wrap break-words text-sm text-fg">{f.body}</p>

              {(f.userAgent || f.resolvedAt) && (
                <div className="mt-3 space-y-1 text-xs text-fg-subtle">
                  {f.resolvedAt && (
                    <p>
                      Resolved <LocalTime at={f.resolvedAt} format="datetime" />
                      {f.resolverEmail ? ` by ${f.resolverEmail}` : ""}
                    </p>
                  )}
                  {f.userAgent && <p className="break-all">{f.userAgent}</p>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
