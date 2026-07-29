"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Wire to a real error reporter before launch. The digest is what
    // correlates this screen with the server log entry.
    console.error("[app-error]", error.digest, error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <div className="rounded-2xl border border-miss/30 bg-miss-dim p-4 text-miss">
        <AlertTriangle className="size-7" aria-hidden="true" />
      </div>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">Something broke</h1>
      <p className="mt-2 max-w-sm text-sm text-fg-muted">
        That&apos;s on us. Try again — if it keeps happening, the reference below helps us
        find it.
      </p>
      {error.digest && (
        <p className="num mt-3 text-xs text-fg-subtle">ref {error.digest}</p>
      )}
      <Button className="mt-6" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
