"use client";

import { useActionState, useEffect, useState } from "react";
import { Gift, Search } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { grantSubscriptionAction, setUserRoleAction } from "@/app/actions/admin";
import type { Role, SubscriptionStatus, Tier } from "@/db/schema";
import { formatDate } from "@/lib/i18n/format";

interface Row {
  id: string;
  email: string;
  role: Role;
  createdAt: Date;
  lastLoginAt: Date | null;
  hasUsedTrial: boolean;
  tier: Tier | null;
  status: SubscriptionStatus | null;
  currentPeriodEnd: Date | null;
}

export function UserTable({
  users,
  currentUserId,
}: {
  users: Row[];
  currentUserId: string;
}) {
  const [roleState, roleAction] = useActionState(setUserRoleAction, null);
  const [grantState, grantAction] = useActionState(grantSubscriptionAction, null);
  const [q, setQ] = useState("");

  useEffect(() => {
    const s = roleState ?? grantState;
    if (s?.ok) toast.success(s.message ?? "Updated");
    else if (s && !s.ok) toast.error(s.error);
  }, [roleState, grantState]);

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
              <TableHead scope="col">Plan</TableHead>
              <TableHead scope="col">Joined</TableHead>
              <TableHead scope="col">Role</TableHead>
              <TableHead scope="col" className="text-right">Actions</TableHead>
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
                    {u.hasUsedTrial && (
                      <span className="ml-2 text-[0.6875rem] text-fg-subtle">
                        trial used
                      </span>
                    )}
                  </TableCell>

                  <TableCell>
                    {u.tier ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Badge variant="brand">{u.tier}</Badge>
                        {u.status === "trialing" && <Badge variant="pending">trial</Badge>}
                        {u.status === "past_due" && <Badge variant="miss">past due</Badge>}
                      </span>
                    ) : (
                      <span className="text-xs text-fg-subtle">—</span>
                    )}
                  </TableCell>

                  <TableCell className="num text-xs text-fg-subtle">
                    {formatDate(u.createdAt, { year: "2-digit" })}
                  </TableCell>

                  <TableCell>
                    {isSelf ? (
                      <Badge variant="outline">{u.role}</Badge>
                    ) : (
                      <form action={roleAction}>
                        <input type="hidden" name="userId" value={u.id} />
                        <Select
                          name="role"
                          defaultValue={u.role}
                          onValueChange={(v) => {
                            const fd = new FormData();
                            fd.set("userId", u.id);
                            fd.set("role", v);
                            roleAction(fd);
                          }}
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
                            <SelectItem value="owner">owner</SelectItem>
                          </SelectContent>
                        </Select>
                      </form>
                    )}
                  </TableCell>

                  <TableCell className="text-right">
                    {!u.tier && (
                      <form action={grantAction} className="inline-flex items-center gap-1">
                        <input type="hidden" name="userId" value={u.id} />
                        <input type="hidden" name="tier" value="elite" />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="sm"
                          className="text-fg-subtle"
                        >
                          <Gift aria-hidden="true" />
                          Comp 30d
                        </Button>
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
    </div>
  );
}
