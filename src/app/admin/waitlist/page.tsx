import type { Metadata } from "next";
import { WaitlistInvite, WaitlistNotify } from "@/components/admin/waitlist-controls";
import { LocalTime } from "@/components/local-time";
import { Badge } from "@/components/ui/badge";
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
      <h1 className="text-2xl font-semibold tracking-tight">Waitlist</h1>
      <p className="mt-1.5 text-sm text-fg-muted">
        {rows.length} {rows.length === 1 ? "person" : "people"} waiting, oldest first. Sign-ups are{" "}
        {open ? (
          <span className="text-hit">open</span>
        ) : (
          <>
            <span className="text-fg">closed</span> — the landing page and /signup add people here.
            Set <code className="text-fg-muted">SIGNUP_ENABLED=1</code> in the server&apos;s .env to open them
          </>
        )}
        .
      </p>

      {open && (
        <div className="mt-6">
          <WaitlistNotify count={untold} />
        </div>
      )}

      {rows.length === 0 ? (
        <p className="mt-8 text-sm text-fg-muted">Nobody waiting.</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="card-hairline flex flex-wrap items-center justify-between gap-3 p-4" data-waitlist-id={r.id}>
              <div className="min-w-0 text-sm">
                <p className="truncate font-medium text-fg">{r.email}</p>
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
