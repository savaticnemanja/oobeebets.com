"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { setUserRoleAction } from "@/app/actions/admin";
import type { Role } from "@/db/schema";

/**
 * An account's role, on its page. Admin access is the whole console, so a
 * change waits for a yes; the select shows the new value meanwhile. Nobody
 * changes their own role (canManageRole), and the server refuses demoting
 * the last admin.
 */
export function RoleControl({ userId, email, role }: { userId: string; email: string; role: Role }) {
  const [state, action] = useActionState(setUserRoleAction, null);
  const [pending, setPending] = useState<Role | null>(null);
  const [, start] = useTransition();

  useEffect(() => {
    if (state?.ok) toast.success(state.message ?? "Updated");
    else if (state && !state.ok) toast.error(state.error);
  }, [state]);

  const confirm = () => {
    if (!pending) return;
    const fd = new FormData();
    fd.set("userId", userId);
    fd.set("role", pending);
    start(() => action(fd));
    setPending(null);
  };

  return (
    <>
      <Select value={pending ?? role} onValueChange={(v) => v !== role && setPending(v as Role)}>
        <SelectTrigger className="h-9 w-32 text-sm" aria-label={`Role for ${email}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="user">user</SelectItem>
          <SelectItem value="admin">admin</SelectItem>
        </SelectContent>
      </Select>

      <AlertDialog open={Boolean(pending)} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>{pending === "admin" ? "Make this an admin?" : "Remove admin access?"}</AlertDialogTitle>
          <AlertDialogDescription>
            {pending === "admin"
              ? `${email} gets the whole admin console: publishing, settling, users and announcements.`
              : `${email} goes back to being a tester and loses the admin console.`}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button type="button" variant={pending === "admin" ? "default" : "danger"} onClick={confirm}>
                {pending === "admin" ? "Make admin" : "Remove access"}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
