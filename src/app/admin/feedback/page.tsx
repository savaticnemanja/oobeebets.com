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
import { Empty, PageHeader, Pager, TabNav, pageParam } from "@/components/admin/kit";
import { MessageSquareText } from "lucide-react";

export const metadata: Metadata = { title: "Feedback" };

export const dynamic = "force-dynamic";

const KIND_BADGE = { bug: "miss", idea: "brand", other: "default" } as const;

/** Per page. */
const LIMIT = 25;

function listHref(resolved: boolean, page: number): string {
  const p = new URLSearchParams();
  if (resolved) p.set("show", "resolved");
  if (page > 1) p.set("page", String(page));
  const q = p.toString();
  return `/admin/feedback${q ? `?${q}` : ""}`;
}

export default async function AdminFeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string; page?: string }>;
}) {
  const [, params] = await Promise.all([requireAdminPage(), searchParams]);
  const showResolved = params.show === "resolved";
  const page = pageParam(params.page);

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
      .limit(LIMIT)
      .offset((page - 1) * LIMIT),
    db.select({ open: count() }).from(feedback).where(isNull(feedback.resolvedAt)),
    db.select({ resolved: count() }).from(feedback).where(isNotNull(feedback.resolvedAt)),
  ]);

  const tabs = [
    { href: "/admin/feedback", label: "Open", n: open, active: !showResolved },
    { href: "/admin/feedback?show=resolved", label: "Resolved", n: resolved, active: showResolved },
  ];

  return (
    <div>
      <PageHeader
        title="Feedback"
        description="What testers send from “Send feedback”, newest first. Mark an item resolved once it's dealt with."
      />
      <TabNav label="Feedback lists" tabs={tabs.map((t) => ({ href: t.href, label: t.label, count: t.n, active: t.active, attention: t.label === "Open" }))} />

      {rows.length === 0 ? (
        <Empty icon={MessageSquareText} title={showResolved ? "Nothing resolved yet" : "All caught up"}>
          {showResolved ? null : "Nothing open."}
        </Empty>
      ) : (
        <ul className="space-y-3">
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
      <Pager
        page={page}
        pageSize={LIMIT}
        total={showResolved ? resolved : open}
        noun="items"
        href={(n) => listHref(showResolved, n)}
      />
    </div>
  );
}
