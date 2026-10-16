"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction } from "@/app/actions/auth";
import type { ActionState } from "@/lib/validation";

function FieldError({ errors, id }: { errors?: string[]; id: string }) {
  if (!errors?.length) return null;
  return (
    <p id={id} className="mt-1.5 text-xs text-miss">
      {errors[0]}
    </p>
  );
}

export function LoginForm({ next, signupOpen }: { next?: string; signupOpen: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    loginAction,
    null,
  );
  // Controlled, so a failed sign-in keeps the address: React resets an
  // uncontrolled field when a form action finishes, error or not.
  const [email, setEmail] = useState("");
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
          value={email}
          onChange={(e) => setEmail(e.target.value)}
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
        <div className="flex items-baseline justify-between gap-3">
          <Label htmlFor="password">Password</Label>
          <Link href="/forgot-password" className="text-xs text-brand hover:underline">
            Forgot password?
          </Link>
        </div>
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
          {signupOpen ? "Sign up" : "Join the waitlist"}
        </Link>
      </p>
    </form>
  );
}
