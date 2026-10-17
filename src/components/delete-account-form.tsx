"use client";

import { useActionState, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteAccountAction } from "@/app/actions/account";
import type { ActionState } from "@/lib/validation";

/**
 * The last section of /account. The password again plus a ticked box, so a
 * borrowed, signed-in phone can't delete an account in one tap. On success the
 * action redirects to /account-deleted; anything else comes back here.
 */
export function DeleteAccountForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(deleteAccountAction, null);
  const [sure, setSure] = useState(false);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  const formError = state && !state.ok && !state.fieldErrors ? state.error : null;

  return (
    <form action={action} className="space-y-4">
      {formError && (
        <p role="alert" className="rounded-lg border border-miss/30 bg-miss-dim px-4 py-3 text-sm text-miss">
          {formError}
        </p>
      )}
      <input type="email" name="username" value={email} autoComplete="username" readOnly hidden />
      <div>
        <Label htmlFor="delete-password">Your password</Label>
        <Input
          id="delete-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="mt-1.5"
          aria-invalid={Boolean(fe?.password)}
          aria-describedby={fe?.password ? "delete-password-error" : undefined}
        />
        {fe?.password && (
          <p id="delete-password-error" role="alert" className="mt-1.5 text-xs text-miss">
            {fe.password[0]}
          </p>
        )}
      </div>
      <label className="flex cursor-pointer items-start gap-3 text-sm text-fg-muted">
        <input
          type="checkbox"
          name="confirm"
          value="yes"
          checked={sure}
          onChange={(e) => setSure(e.target.checked)}
          aria-invalid={Boolean(fe?.confirm)}
          aria-describedby={fe?.confirm ? "delete-confirm-error" : undefined}
          className="mt-0.5 size-4 shrink-0 accent-[var(--color-miss)]"
        />
        <span>I understand this deletes my account and everything on it, and can&apos;t be undone.</span>
      </label>
      {fe?.confirm && (
        <p id="delete-confirm-error" role="alert" className="-mt-2 text-xs text-miss">
          {fe.confirm[0]}
        </p>
      )}
      <Button type="submit" variant="danger" className="rounded-full" disabled={pending || !sure}>
        {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
        Delete my account
      </Button>
    </form>
  );
}
