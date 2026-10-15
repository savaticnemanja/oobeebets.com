import { notFound } from "next/navigation";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { invitations, subscriptions, users } from "@/db/schema";
import { LIVE_STATUSES } from "@/lib/billing/access";
import { TIERS, TIER_ORDER } from "@/lib/tiers";
import { getAuth } from "@/lib/auth";
import { UserTable } from "@/components/admin/user-table";
import { InvitePanel } from "@/components/admin/invite-panel";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Users" };

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const auth = await getAuth();
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

  // Each account's best live plan; free otherwise.
  const live = await db
    .select({ userId: subscriptions.userId, tier: subscriptions.tier, status: subscriptions.status })
    .from(subscriptions)
    .where(inArray(subscriptions.status, LIVE_STATUSES));
  const planOf = new Map<string, (typeof live)[number]>();
  for (const s of live) {
    const had = planOf.get(s.userId);
    if (!had || TIER_ORDER.indexOf(s.tier) > TIER_ORDER.indexOf(had.tier)) planOf.set(s.userId, s);
  }
  const withPlans = rows.map((u) => {
    const s = planOf.get(u.id);
    return { ...u, plan: s ? `${TIERS[s.tier].name}${s.status === "past_due" ? " · past due" : ""}` : null };
  });

  const [{ n: adminCount }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(eq(users.role, "admin"));

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
        {rows.length} accounts · {adminCount} with admin access. Any admin can
        change roles, but not their own — and the last admin can&apos;t be demoted.
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
        <UserTable users={withPlans} currentUserId={auth.user.id} />
      </div>
    </div>
  );
}
