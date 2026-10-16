import Link from "next/link";
import type { Metadata } from "next";
import { desc, eq, sql } from "drizzle-orm";
import { UserPlus } from "lucide-react";
import { db } from "@/db";
import { invitations, users } from "@/db/schema";
import { requireAdminPage } from "@/lib/auth";
import { signupEnabled } from "@/lib/signup";
import { listUsers } from "@/lib/admin/users";
import { USER_FILTERS, USER_SORTS, directoryHref, type DirectoryQuery, type UserFilter, type UserSort } from "@/lib/admin/directory";
import { UserDirectory } from "@/components/admin/user-directory";
import { InvitePanel } from "@/components/admin/invite-panel";
import { PageHeader, Pager, TabNav, pageParam } from "@/components/admin/kit";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Users" };

export const dynamic = "force-dynamic";

const PAGE = 50;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; filter?: string; sort?: string; page?: string }>;
}) {
  const [auth, params] = await Promise.all([requireAdminPage(), searchParams]);
  const tab = params.tab === "invites" ? "invites" : "accounts";
  const page = pageParam(params.page);
  const query: DirectoryQuery = {
    q: (params.q ?? "").slice(0, 100).trim(),
    filter: USER_FILTERS.includes(params.filter as UserFilter) ? (params.filter as UserFilter) : "all",
    sort: USER_SORTS.includes(params.sort as UserSort) ? (params.sort as UserSort) : "newest",
  };

  const [directory, inviteRows, [{ pendingInvites, invites }]] = await Promise.all([
    tab === "accounts" ? listUsers({ ...query, page, size: PAGE }) : null,
    tab === "invites"
      ? db
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
          .limit(PAGE)
          .offset((page - 1) * PAGE)
      : [],
    db
      .select({
        invites: sql<number>`count(*)::int`,
        pendingInvites: sql<number>`count(*) filter (where ${invitations.status} = 'pending' and ${invitations.expiresAt} > now())::int`,
      })
      .from(invitations),
  ]);

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

      {directory ? (
        <>
          <UserDirectory rows={directory.rows} counts={directory.counts} query={query} currentUserId={auth.user.id} />
          <Pager page={page} pageSize={PAGE} total={directory.total} noun="accounts" href={(n) => directoryHref(query, n)} />
        </>
      ) : (
        <>
          <InvitePanel invitations={inviteRows} />
          <Pager page={page} pageSize={PAGE} total={invites} noun="invitations" href={(n) => `/admin/users?tab=invites&page=${n}`} />
        </>
      )}
    </div>
  );
}
