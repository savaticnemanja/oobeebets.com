"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordResetAction, resetPasswordAction } from "@/app/actions/password-reset";
import type { ActionState } from "@/lib/validation";

function FieldError({ errors, id }: { errors?: string[]; id: string }) {
  if (!errors?.length) return null;
  return (
    <p id={id} className="mt-1.5 text-xs text-miss">
      {errors[0]}
    </p>
  );
}

function FormError({ state }: { state: ActionState }) {
  if (!state || state.ok || state.fieldErrors) return null;
  return (
    <p role="alert" className="rounded-lg border border-miss/30 bg-miss-dim px-4 py-3 text-sm text-miss">
      {state.error}
    </p>
  );
}

/** Step one: the address to send the link to. Says the same thing whether or not it has an account. */
export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(requestPasswordResetAction, null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;

  if (state?.ok) {
    return (
      <div role="status" className="space-y-4">
        <p className="flex gap-3 rounded-lg border border-brand/25 bg-brand/5 px-4 py-3 text-sm text-brand">
          <MailCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{state.message}</span>
        </p>
        <p className="text-center text-sm text-fg-muted">
          <Link href="/login" className="text-brand hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <FormError state={state} />
      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
          placeholder="you@example.com"
          className="mt-1.5"
          aria-invalid={Boolean(fe?.email)}
          aria-describedby={fe?.email ? "email-error" : undefined}
        />
        <FieldError errors={fe?.email} id="email-error" />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
        Send reset link
      </Button>
      <p className="text-center text-sm text-fg-muted">
        Remembered it?{" "}
        <Link href="/login" className="text-brand hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}

/** Step two, from the emailed link: the new password, twice. */
export function ResetPasswordForm({ token, email }: { token: string; email: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(resetPasswordAction, null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={action} className="space-y-4">
      <FormError state={state} />
      <input type="hidden" name="token" value={token} />
      {/* For password managers: which account this new password belongs to. */}
      <input type="email" name="username" value={email} autoComplete="username" readOnly hidden />
      <div>
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          autoFocus
          minLength={8}
          className="mt-1.5"
          aria-invalid={Boolean(fe?.password)}
          aria-describedby={fe?.password ? "password-error" : "password-hint"}
        />
        {fe?.password ? (
          <FieldError errors={fe.password} id="password-error" />
        ) : (
          <p id="password-hint" className="mt-1.5 text-xs text-fg-subtle">
            At least 8 characters.
          </p>
        )}
      </div>
      <div>
        <Label htmlFor="confirm">Confirm new password</Label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          className="mt-1.5"
          aria-invalid={Boolean(fe?.confirm)}
          aria-describedby={fe?.confirm ? "confirm-error" : undefined}
        />
        <FieldError errors={fe?.confirm} id="confirm-error" />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
        Set new password
      </Button>
      <p className="text-center text-xs text-fg-subtle">
        This signs you out on every other device.
      </p>
    </form>
  );
}
