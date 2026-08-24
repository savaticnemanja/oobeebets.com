import { notFound } from "next/navigation";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { invitations, users } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import { UserTable } from "@/components/admin/user-table";
import { InvitePanel } from "@/components/admin/invite-panel";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Users" };

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const auth = await getAuth();
  // Any admin can invite; only an owner can change roles (enforced below and
  // at the action layer).
  if (!auth?.isAdmin) notFound();

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt))
    .limit(200);

  const [{ n: adminCount }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(sql`${users.role} in ('admin','owner')`);

  const inviteRows = await db
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
    .limit(200);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
      <p className="mt-1.5 text-sm text-fg-muted">
        {rows.length} accounts · {adminCount} with admin access.
        {auth.isOwner
          ? " Only an owner can change roles, and the last owner can't be demoted."
          : " Ask an owner to change a role."}
      </p>

      <div className="mt-8">
        <h2 className="text-sm font-semibold tracking-tight">Invite a tester</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Signup is invite-only — this is the only way a new account gets created.
        </p>
        <div className="mt-4">
          <InvitePanel invitations={inviteRows} />
        </div>
      </div>

      <div className="mt-10">
        <UserTable users={rows} currentUserId={auth.user.id} viewerIsOwner={auth.isOwner} />
      </div>
    </div>
  );
}
