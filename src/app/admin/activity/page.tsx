import Link from "next/link";
import type { Metadata } from "next";
import { History } from "lucide-react";
import { requireAdminPage } from "@/lib/auth";
import { ACTIVITY_TYPES, ACTIVITY_TYPE_LABEL, getActivity, type ActivityType } from "@/lib/admin/activity";
import { ActivityList } from "@/components/admin/activity-list";
import { Empty, PageHeader, TabNav } from "@/components/admin/kit";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Activity" };

export const dynamic = "force-dynamic";

/**
 * The whole audit log, newest first, as sentences: every publish, result,
 * role change, invite and moderation call, plus accounts joining and
 * changing their passwords. Filter by kind; page back with "Older".
 */
export default async function AdminActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; before?: string }>;
}) {
  const [, params] = await Promise.all([requireAdminPage(), searchParams]);
  const type = ACTIVITY_TYPES.includes(params.type as ActivityType) ? (params.type as ActivityType) : null;
  const before = params.before && !Number.isNaN(Date.parse(params.before)) ? new Date(params.before) : null;

  const { items, next } = await getActivity({ type, before });
  const href = (t: ActivityType | null, b?: Date | null) => {
    const q = new URLSearchParams();
    if (t) q.set("type", t);
    if (b) q.set("before", b.toISOString());
    const s = q.toString();
    return `/admin/activity${s ? `?${s}` : ""}`;
  };

  return (
    <div>
      <PageHeader
        title="Activity"
        description="Everything done in the console, and the account events worth a record — who did what, and when."
        info="This is the audit log. Results the grader records on its own show as the Auto-grader. Nothing here can be edited or deleted."
      />

      <TabNav
        label="Kinds of activity"
        tabs={[
          { href: href(null), label: "All", active: type === null },
          ...ACTIVITY_TYPES.map((t) => ({ href: href(t), label: ACTIVITY_TYPE_LABEL[t], active: type === t })),
        ]}
      />

      {items.length === 0 ? (
        <Empty icon={History} title={before ? "Nothing older" : "Nothing logged yet"}>
          {before ? <Link href={href(type)} className="text-brand hover:underline">Back to the newest</Link> : null}
        </Empty>
      ) : (
        <>
          <ActivityList items={items} grouped />
          <div className="mt-8 flex items-center justify-between gap-3">
            {before ? (
              <Button variant="ghost" size="sm" asChild>
                <Link href={href(type)}>Newest</Link>
              </Button>
            ) : (
              <span />
            )}
            {next && (
              <Button variant="outline" size="sm" asChild>
                <Link href={href(type, next)}>Older</Link>
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
