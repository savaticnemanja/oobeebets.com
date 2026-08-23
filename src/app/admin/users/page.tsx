import { notFound } from "next/navigation";
import { desc, sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import { UserTable } from "@/components/admin/user-table";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Users" };

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const auth = await getAuth();
  // Role management is owner-only, matching the action layer.
  if (!auth?.isOwner) notFound();

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

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
      <p className="mt-1.5 text-sm text-fg-muted">
        {rows.length} accounts · {adminCount} with admin access. Only an owner can change
        roles, and the last owner can&apos;t be demoted.
      </p>

      <div className="mt-8">
        <UserTable users={rows} currentUserId={auth.user.id} />
      </div>
    </div>
  );
}
