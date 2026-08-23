"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction, signupAction } from "@/app/actions/auth";
import type { ActionState } from "@/lib/validation";

function FieldError({ errors, id }: { errors?: string[]; id: string }) {
  if (!errors?.length) return null;
  return (
    <p id={id} className="mt-1.5 text-xs text-miss">
      {errors[0]}
    </p>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    loginAction,
    null,
  );
  const fe = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={action} className="space-y-4">
      {state && !state.ok && !state.fieldErrors && (
        <p
          role="alert"
          className="rounded-lg border border-miss/30 bg-miss-dim px-4 py-3 text-sm text-miss"
        >
          {state.error}
        </p>
      )}

      {next && <input type="hidden" name="next" value={next} />}

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

      <div>
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="mt-1.5"
          aria-invalid={Boolean(fe?.password)}
          aria-describedby={fe?.password ? "password-error" : undefined}
        />
        <FieldError errors={fe?.password} id="password-error" />
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
        Sign in
      </Button>

      <p className="text-center text-xs text-fg-subtle">
        You&apos;ll stay signed in on this device for 30 days.
      </p>

      <p className="text-center text-sm text-fg-muted">
        No account?{" "}
        <Link href="/signup" className="text-brand hover:underline">
          Create one
        </Link>
      </p>
    </form>
  );
}

export function SignupForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    signupAction,
    null,
  );
  const fe = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={action} className="space-y-4">
      {state && !state.ok && !state.fieldErrors && (
        <p
          role="alert"
          className="rounded-lg border border-miss/30 bg-miss-dim px-4 py-3 text-sm text-miss"
        >
          {state.error}
        </p>
      )}

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

      <div>
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
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
        <Label htmlFor="confirm">Confirm password</Label>
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
        Create account
      </Button>

      <p className="text-center text-xs leading-relaxed text-fg-subtle">
        By creating an account you confirm you&apos;re 18 or over and you agree to our{" "}
        <Link href="/legal/terms" className="text-fg-muted underline">
          terms
        </Link>
        .
      </p>

      <p className="text-center text-sm text-fg-muted">
        Already have one?{" "}
        <Link href="/login" className="text-brand hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
