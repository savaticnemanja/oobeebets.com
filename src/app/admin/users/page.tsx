import Link from "next/link";
import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { UserPlus } from "lucide-react";
import { db } from "@/db";
import { invitations, users } from "@/db/schema";
import { requireAdminPage } from "@/lib/auth";
import { signupEnabled } from "@/lib/signup";
import { listUsers } from "@/lib/admin/users";
import { UserDirectory } from "@/components/admin/user-directory";
import { InvitePanel } from "@/components/admin/invite-panel";
import { PageHeader, TabNav } from "@/components/admin/kit";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Users" };

export const dynamic = "force-dynamic";

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const [auth, params] = await Promise.all([requireAdminPage(), searchParams]);
  const tab = params.tab === "invites" ? "invites" : "accounts";

  const [rows, inviteRows] = await Promise.all([
    tab === "accounts" ? listUsers() : Promise.resolve([]),
    db
      .select({
        id: invitations.id,
        email: invitations.email,
        status: invitations.status,
        invitedByEmail: users.email,
        createdAt: invitations.createdAt,
        expiresAt: invitations.expiresAt,
      })
      .from(invitations)
      .leftJoin(users, eq(users.id, invitations.invitedBy))
      .orderBy(desc(invitations.createdAt))
      .limit(200),
  ]);
  const pendingInvites = inviteRows.filter((i) => i.status === "pending" && i.expiresAt > new Date()).length;

  return (
    <div>
      <PageHeader
        title="Users"
        description={
          signupEnabled()
            ? "Every account, and the invites that let people in. Sign-ups are open, so anyone can also join from /signup."
            : "Every account, and the invites that let people in. Sign-ups are closed: an invite or the waitlist is the only way in."
        }
        info="Open an account to see its bets, parlays, sessions and activity, and to change its role. Any admin can change anyone's role except their own, and the last admin can't be demoted."
        actions={
          tab === "accounts" && (
            <Button size="sm" variant="outline" asChild>
              <Link href="/admin/users?tab=invites">
                <UserPlus aria-hidden="true" />
                Invite a tester
              </Link>
            </Button>
          )
        }
      />

      <TabNav
        label="Users"
        tabs={[
          { href: "/admin/users", label: "Accounts", active: tab === "accounts" },
          { href: "/admin/users?tab=invites", label: "Invitations", count: pendingInvites, active: tab === "invites" },
        ]}
      />

      {tab === "accounts" ? (
        <UserDirectory rows={rows} currentUserId={auth.user.id} />
      ) : (
        <InvitePanel invitations={inviteRows} />
      )}
    </div>
  );
}
