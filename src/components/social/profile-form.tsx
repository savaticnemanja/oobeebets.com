"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { updateProfileAction } from "@/app/actions/social";
import { BIO_MAX_LENGTH } from "@/lib/social-rules";
import type { ActionState } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function FieldError({ id, messages }: { id: string; messages?: string[] }) {
  if (!messages?.length) return null;
  return (
    <p id={id} className="mt-1.5 text-xs text-miss">
      {messages[0]}
    </p>
  );
}

/** Name, handle and bio — everything on the public profile a tester controls. */
export function ProfileForm({
  displayName,
  username,
  bio,
}: {
  displayName: string;
  username: string;
  bio: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(async (prev, fd) => {
    const result = await updateProfileAction(prev, fd);
    if (result?.ok) toast.success(result.message ?? "Saved");
    return result;
  }, null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  const [handle, setHandle] = React.useState(username);
  const [bioText, setBioText] = React.useState(bio);

  return (
    <form action={action} className="space-y-4">
      {state && !state.ok && !state.fieldErrors && (
        <p role="alert" className="rounded-lg border border-miss/30 bg-miss-dim px-3 py-2 text-sm text-miss">
          {state.error}
        </p>
      )}

      <div>
        <Label htmlFor="displayName">Name</Label>
        <Input
          id="displayName"
          name="displayName"
          defaultValue={displayName}
          maxLength={50}
          required
          className="mt-1.5"
          aria-invalid={Boolean(fe?.displayName)}
          aria-describedby={fe?.displayName ? "displayName-error" : undefined}
        />
        <FieldError id="displayName-error" messages={fe?.displayName} />
      </div>

      <div>
        <Label htmlFor="username">Handle</Label>
        <div className="relative mt-1.5">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-fg-subtle">@</span>
          <Input
            id="username"
            name="username"
            value={handle}
            onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
            maxLength={20}
            minLength={3}
            required
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="pl-7"
            aria-invalid={Boolean(fe?.username)}
            aria-describedby={fe?.username ? "username-error" : "username-hint"}
          />
        </div>
        {fe?.username ? (
          <FieldError id="username-error" messages={fe.username} />
        ) : (
          <p id="username-hint" className="mt-1.5 text-xs text-fg-subtle">
            3–20 letters, numbers or underscores. Your profile lives at /u/{handle || "…"}.
          </p>
        )}
      </div>

      <div>
        <div className="flex items-baseline justify-between">
          <Label htmlFor="bio">Bio</Label>
          <span className="num text-xs text-fg-subtle">
            {bioText.length}/{BIO_MAX_LENGTH}
          </span>
        </div>
        <Textarea
          id="bio"
          name="bio"
          value={bioText}
          onChange={(e) => setBioText(e.target.value)}
          maxLength={BIO_MAX_LENGTH}
          rows={3}
          placeholder="Who you are, what you bet on."
          className="mt-1.5"
          aria-invalid={Boolean(fe?.bio)}
          aria-describedby={fe?.bio ? "bio-error" : undefined}
        />
        <FieldError id="bio-error" messages={fe?.bio} />
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending} className="rounded-full">
          {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
          Save profile
        </Button>
        <Button variant="link" asChild>
          <Link href={`/u/${username}`}>View profile</Link>
        </Button>
      </div>
    </form>
  );
}
