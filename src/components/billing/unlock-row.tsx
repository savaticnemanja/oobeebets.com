import Link from "next/link";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PASS } from "@/lib/pass";

/**
 * Where the free board stops: one full-width row, the same width as a pick,
 * saying what's past it. The locked picks themselves are never sent — only
 * their count.
 */
export function UnlockRow({ what }: { what: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-4">
      <p className="flex min-w-0 items-center gap-2 text-sm text-fg-muted">
        <Lock className="size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
        <span>
          <span className="text-fg">{what}</span> with a {PASS.name}
        </span>
      </p>
      <Button asChild size="sm" className="shrink-0 rounded-full">
        <Link href="/account#pass">Unlock</Link>
      </Button>
    </div>
  );
}
