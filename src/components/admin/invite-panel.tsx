"use client";

import { useActionState, useEffect, useRef } from "react";
import { Ban, Loader2, RotateCcw } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { sendInviteAction, resendInviteAction, revokeInviteAction } from "@/app/actions/invite";
import type { InviteStatus } from "@/db/schema";
import { LocalTime } from "@/components/local-time";

interface InviteRow {
  id: string;
  email: string;
  status: InviteStatus;
  invitedByEmail: string | null;
  createdAt: Date;
  expiresAt: Date;
}

const STATUS_VARIANT: Record<InviteStatus, "pending" | "hit" | "miss" | "void"> = {
  pending: "pending",
  accepted: "hit",
  revoked: "miss",
  expired: "void",
};

export function InvitePanel({ invitations }: { invitations: InviteRow[] }) {
  const [sendState, sendAction, sendPending] = useActionState(sendInviteAction, null);
  const [resendState, resendAction] = useActionState(resendInviteAction, null);
  const [revokeState, revokeAction] = useActionState(revokeInviteAction, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (sendState?.ok) {
      toast.success(sendState.message ?? "Invite sent");
      formRef.current?.reset();
    } else if (sendState && !sendState.ok) {
      toast.error(sendState.error);
    }
  }, [sendState]);

  useEffect(() => {
    if (resendState?.ok) toast.success(resendState.message ?? "Resent");
    else if (resendState && !resendState.ok) toast.error(resendState.error);
  }, [resendState]);

  useEffect(() => {
    if (revokeState?.ok) toast.success(revokeState.message ?? "Revoked");
    else if (revokeState && !revokeState.ok) toast.error(revokeState.error);
  }, [revokeState]);

  const fe = sendState && !sendState.ok ? sendState.fieldErrors : undefined;

  return (
    <div>
      <form ref={formRef} action={sendAction} className="flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1">
          <Label htmlFor="invite-email">Email</Label>
          <Input
            id="invite-email"
            name="email"
            type="email"
            required
            placeholder="new-tester@example.com"
            className="mt-1.5"
            aria-invalid={Boolean(fe?.email)}
            aria-describedby={fe?.email ? "invite-email-error" : undefined}
          />
          {fe?.email && (
            <p id="invite-email-error" className="mt-1.5 text-xs text-miss">
              {fe.email[0]}
            </p>
          )}
        </div>
        <Button type="submit" disabled={sendPending}>
          {sendPending && <Loader2 className="animate-spin" aria-hidden="true" />}
          Send invite
        </Button>
      </form>

      {invitations.length > 0 && (
        <div className="card-hairline mt-6 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Email</TableHead>
                <TableHead scope="col">Status</TableHead>
                <TableHead scope="col">Invited by</TableHead>
                <TableHead scope="col">Sent</TableHead>
                <TableHead scope="col">Expires</TableHead>
                <TableHead scope="col" className="text-right">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invitations.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="text-fg">{inv.email}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[inv.status]}>{inv.status}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-fg-subtle">
                    {inv.invitedByEmail ?? "—"}
                  </TableCell>
                  <TableCell className="num text-xs text-fg-subtle">
                    <LocalTime at={inv.createdAt} format="date" year="2-digit" />
                  </TableCell>
                  <TableCell className="num text-xs text-fg-subtle">
                    <LocalTime at={inv.expiresAt} format="date" year="2-digit" />
                  </TableCell>
                  <TableCell className="text-right">
                    {inv.status === "pending" && (
                      <div className="flex justify-end gap-2">
                        <form action={resendAction}>
                          <input type="hidden" name="inviteId" value={inv.id} />
                          <Button
                            variant="ghost"
                            size="sm"
                            type="submit"
                            aria-label={`Resend invite to ${inv.email}`}
                          >
                            <RotateCcw aria-hidden="true" />
                          </Button>
                        </form>
                        <form action={revokeAction}>
                          <input type="hidden" name="inviteId" value={inv.id} />
                          <Button
                            variant="danger"
                            size="sm"
                            type="submit"
                            aria-label={`Revoke invite to ${inv.email}`}
                          >
                            <Ban aria-hidden="true" />
                          </Button>
                        </form>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {invitations.length === 0 && (
        <p className="mt-6 text-sm text-fg-muted">No invites sent yet.</p>
      )}
    </div>
  );
}
