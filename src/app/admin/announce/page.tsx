import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import { selectableRecipients } from "@/lib/announcements";
import { AnnounceComposer } from "@/components/admin/announce-composer";
import { LocalTime } from "@/components/local-time";

export const metadata: Metadata = { title: "Announce" };

export const dynamic = "force-dynamic";

interface SentMeta {
  heading?: string;
  audienceLabel?: string;
  sent?: number;
  requested?: number;
}

export default async function AdminAnnouncePage() {
  const auth = await getAuth();
  // 404 rather than 403 — same posture as the rest of /admin.
  if (!auth?.isAdmin) notFound();

  const [accounts, history] = await Promise.all([
    selectableRecipients(),
    // The audit log is already the record of what went out, so there is no
    // second table to keep in step with it.
    db
      .select({ id: auditLog.id, meta: auditLog.meta, createdAt: auditLog.createdAt })
      .from(auditLog)
      .where(eq(auditLog.action, "announcement.sent"))
      .orderBy(desc(auditLog.createdAt))
      .limit(10),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Announce</h1>
      <p className="mt-1.5 max-w-2xl text-sm text-fg-muted">
        Write once and send it to the testers. Same envelope as the invite email —
        wordmark, card and footer — with your heading and words inside it. Everyone
        gets their own copy, so no address is visible to anyone else.
      </p>

      <div className="mt-8">
        <AnnounceComposer accounts={accounts} />
      </div>

      {history.length > 0 && (
        <section aria-labelledby="sent-heading" className="mt-12">
          <h2 id="sent-heading" className="text-sm font-semibold tracking-tight">
            Recently sent
          </h2>
          <ul className="card-hairline mt-3 divide-y divide-border">
            {history.map((row) => {
              const meta = (row.meta ?? {}) as SentMeta;
              return (
                <li
                  key={row.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-fg">
                    {meta.heading ?? "(no heading recorded)"}
                  </span>
                  <span className="text-xs text-fg-muted">
                    {meta.audienceLabel ?? "—"} · {meta.sent ?? 0} sent
                  </span>
                  <time
                    dateTime={row.createdAt.toISOString()}
                    className="num shrink-0 text-xs text-fg-subtle"
                  >
                    <LocalTime at={row.createdAt} format="datetime" />
                  </time>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
