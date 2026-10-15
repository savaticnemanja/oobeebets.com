"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { setUserRoleAction } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/misc";
import type { Role } from "@/db/schema";
import { formatDate } from "@/lib/i18n/format";

interface Row {
  id: string;
  email: string;
  role: Role;
  createdAt: Date;
  lastLoginAt: Date | null;
  /** "Pro", "Base · past due"; null on the free board. */
  plan: string | null;
}

export function UserTable({
  users,
  currentUserId,
}: {
  users: Row[];
  currentUserId: string;
}) {
  const [roleState, roleAction] = useActionState(setUserRoleAction, null);
  const [q, setQ] = useState("");
  // A role change waits here until it's confirmed; the select shows it meanwhile.
  const [pendingRole, setPendingRole] = useState<{ id: string; email: string; role: Role } | null>(null);
  const [, startRole] = useTransition();
  const confirmRole = () => {
    if (!pendingRole) return;
    const fd = new FormData();
    fd.set("userId", pendingRole.id);
    fd.set("role", pendingRole.role);
    startRole(() => roleAction(fd));
    setPendingRole(null);
  };

  useEffect(() => {
    if (roleState?.ok) toast.success(roleState.message ?? "Updated");
    else if (roleState && !roleState.ok) toast.error(roleState.error);
  }, [roleState]);

  const filtered = q
    ? users.filter((u) => u.email.toLowerCase().includes(q.toLowerCase()))
    : users;

  return (
    <div>
      <div className="relative max-w-xs">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle"
          aria-hidden="true"
        />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search email…"
          aria-label="Search users by email"
          className="pl-9"
        />
      </div>

      <div className="card-hairline mt-4 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Email</TableHead>
              <TableHead scope="col">Joined</TableHead>
              <TableHead scope="col">Plan</TableHead>
              <TableHead scope="col">Role</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((u) => {
              const isSelf = u.id === currentUserId;
              return (
                <TableRow key={u.id}>
                  <TableCell>
                    <span className="text-fg">{u.email}</span>
                    {isSelf && <span className="ml-2 text-xs text-fg-subtle">(you)</span>}
                  </TableCell>

                  <TableCell className="num text-xs text-fg-subtle">
                    {formatDate(u.createdAt, { year: "2-digit" })}
                  </TableCell>

                  <TableCell className="text-xs">
                    {u.plan ? <Badge variant="brand">{u.plan}</Badge> : <span className="text-fg-subtle">Free</span>}
                  </TableCell>

                  <TableCell>
                    {/* Only your own row is fixed — an admin can change anyone
                        else's role, but never their own. */}
                    {isSelf ? (
                      <Badge variant="outline">{u.role}</Badge>
                    ) : (
                      <form action={roleAction}>
                        <input type="hidden" name="userId" value={u.id} />
                        <Select
                          name="role"
                          value={pendingRole?.id === u.id ? pendingRole.role : u.role}
                          onValueChange={(v) => setPendingRole({ id: u.id, email: u.email, role: v as Role })}
                        >
                          <SelectTrigger
                            className="h-8 w-28 text-xs"
                            aria-label={`Role for ${u.email}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="user">user</SelectItem>
                            <SelectItem value="admin">admin</SelectItem>
                          </SelectContent>
                        </Select>
                      </form>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {filtered.length === 0 && (
        <p className="mt-6 text-center text-sm text-fg-muted">No users match that.</p>
      )}

      {/* Admin access is the whole panel: granting or removing it asks first. */}
      <AlertDialog open={Boolean(pendingRole)} onOpenChange={(o) => !o && setPendingRole(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>{pendingRole?.role === "admin" ? "Make this an admin?" : "Remove admin access?"}</AlertDialogTitle>
          <AlertDialogDescription>
            {pendingRole?.role === "admin"
              ? `${pendingRole?.email} gets the whole admin panel: publishing, settling, users and announcements.`
              : `${pendingRole?.email} goes back to being a tester and loses the admin panel.`}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button type="button" variant="outline">Cancel</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button type="button" variant={pendingRole?.role === "admin" ? "default" : "danger"} onClick={confirmRole}>
                {pendingRole?.role === "admin" ? "Make admin" : "Remove access"}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
