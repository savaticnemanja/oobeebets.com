import type { Metadata } from "next";
import { WaitlistInvite, WaitlistNotify } from "@/components/admin/waitlist-controls";
import { LocalTime } from "@/components/local-time";
import { Badge } from "@/components/ui/badge";
import { Empty, PageHeader } from "@/components/admin/kit";
import { Hourglass } from "lucide-react";
import { requireAdminPage } from "@/lib/auth";
import { signupEnabled } from "@/lib/signup";
import { getWaitlist } from "@/lib/waitlist";

export const metadata: Metadata = { title: "Waitlist" };

export const dynamic = "force-dynamic";

/**
 * Everyone who asked to be let in, oldest first — the order they'd get a
 * place. While sign-ups are closed (SIGNUP_ENABLED unset) an admin lets
 * people in one at a time with an invite; once they're open, one button
 * tells everyone at once. A row goes when its address makes an account.
 */
export default async function AdminWaitlistPage() {
  await requireAdminPage();
  const [rows, open] = [await getWaitlist(), signupEnabled()];
  const untold = rows.filter((r) => r.notifiedAt === null).length;

  return (
    <div>
      <PageHeader
        title="Waitlist"
        description={
          <>
            {rows.length} {rows.length === 1 ? "person" : "people"} waiting, oldest first. Sign-ups are{" "}
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

      {rows.length === 0 ? (
        <Empty icon={Hourglass} title="Nobody waiting" />
      ) : (
        <ul className="card-hairline divide-y divide-border/60">
          {rows.map((r, i) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" data-waitlist-id={r.id}>
              <div className="min-w-0 text-sm">
                <p className="truncate font-medium text-fg">
                  <span className="num mr-2 text-xs font-normal text-fg-subtle">{i + 1}</span>
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
    </div>
  );
}
