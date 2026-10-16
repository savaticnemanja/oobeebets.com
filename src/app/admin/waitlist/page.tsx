import type { Metadata } from "next";
import { WaitlistInvite, WaitlistNotify } from "@/components/admin/waitlist-controls";
import { LocalTime } from "@/components/local-time";
import { Badge } from "@/components/ui/badge";
import { Empty, PageHeader, Pager, pageParam } from "@/components/admin/kit";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Hourglass } from "lucide-react";
import { requireAdminPage } from "@/lib/auth";
import { signupEnabled } from "@/lib/signup";
import { getWaitlistPage } from "@/lib/waitlist";

export const metadata: Metadata = { title: "Waitlist" };

export const dynamic = "force-dynamic";

/**
 * Everyone who asked to be let in, oldest first — the order they'd get a
 * place. While sign-ups are closed (SIGNUP_ENABLED unset) an admin lets
 * people in one at a time with an invite; once they're open, one button
 * tells everyone at once. A row goes when its address makes an account.
 */
const PAGE = 50;

export default async function AdminWaitlistPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const [, params] = await Promise.all([requireAdminPage(), searchParams]);
  const q = (params.q ?? "").slice(0, 100).trim();
  const page = pageParam(params.page);
  const open = signupEnabled();
  const { rows, total, waiting, untold } = await getWaitlistPage({ q, page, size: PAGE });
  const href = (n: number) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (n > 1) p.set("page", String(n));
    const s = p.toString();
    return `/admin/waitlist${s ? `?${s}` : ""}`;
  };

  return (
    <div>
      <PageHeader
        title="Waitlist"
        description={
          <>
            {waiting} {waiting === 1 ? "person" : "people"} waiting, oldest first. Sign-ups are{" "}
            {open ? (
              <span className="text-hit">open</span>
            ) : (
              <>
                <span className="text-fg">closed</span> — the landing page and /signup add people here
              </>
            )}
            .
          </>
        }
        info={
          open
            ? "Anyone can sign up from /signup right now. Tell the people waiting with the button — each gets one email, once."
            : "While sign-ups are closed, let people in one at a time with Invite. Set SIGNUP_ENABLED=1 in the server's .env to open them. A row disappears when its address makes an account."
        }
      />

      {open && (
        <div className="mb-6">
          <WaitlistNotify count={untold} />
        </div>
      )}

      {waiting > 0 && (
        <form action="/admin/waitlist" className="mb-4 flex max-w-sm gap-2" role="search">
          <Input name="q" defaultValue={q} placeholder="Search email" aria-label="Search the waitlist" />
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
      )}

      {rows.length === 0 ? (
        <Empty icon={Hourglass} title={q ? "No one matches that" : "Nobody waiting"} />
      ) : (
        <ul className="card-hairline divide-y divide-border/60">
          {rows.map((r, i) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" data-waitlist-id={r.id}>
              <div className="min-w-0 text-sm">
                <p className="truncate font-medium text-fg">
                  {!q && <span className="num mr-2 text-xs font-normal text-fg-subtle">{(page - 1) * PAGE + i + 1}</span>}
                  {r.email}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-subtle">
                  <span>
                    Joined <LocalTime at={r.createdAt} format="datetime" /> from {r.source === "signup" ? "/signup" : "the landing page"}
                  </span>
                  {r.invitedAt && <Badge variant="brand">Invited</Badge>}
                  {r.notifiedAt && <Badge>Told sign-ups are open</Badge>}
                </p>
              </div>
              <WaitlistInvite id={r.id} invited={r.invitedAt !== null} />
            </li>
          ))}
        </ul>
      )}
      <Pager page={page} pageSize={PAGE} total={total} noun="people" href={href} />
    </div>
  );
}
