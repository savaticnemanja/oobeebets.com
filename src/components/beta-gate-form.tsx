"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { unlockBetaAction } from "@/app/actions/beta-gate";
import type { ActionState } from "@/lib/validation";

export function BetaGateForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    unlockBetaAction,
    null,
  );
  const fieldError = state && !state.ok ? state.fieldErrors?.password?.[0] : undefined;

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
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          // Not any one person's password, so offering to save it as one — or
          // to fill it from a saved login — only confuses a password manager.
          autoComplete="off"
          required
          autoFocus
          className="mt-1.5"
          aria-invalid={Boolean(fieldError)}
          aria-describedby={fieldError ? "password-error" : undefined}
        />
        {fieldError && (
          <p id="password-error" className="mt-1.5 text-xs text-miss">
            {fieldError}
          </p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />}
        {pending ? "Checking" : "Enter"}
      </Button>
    </form>
  );
}
