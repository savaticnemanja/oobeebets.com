import type { Metadata } from "next";
import Link from "next/link";
import { WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Offline",
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <main
      id="main"
      className="flex min-h-dvh flex-col items-center justify-center px-6 text-center"
    >
      <div className="rounded-2xl border border-border bg-surface p-4 text-fg-muted">
        <WifiOff className="size-7" aria-hidden="true" />
      </div>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">You&apos;re offline</h1>
      <p className="mt-2 max-w-sm text-sm text-fg-muted">
        Picks and results are never served from cache — a stale board is worse than no
        board. Reconnect and we&apos;ll load the live one.
      </p>
      <Button asChild className="mt-6">
        <Link href="/picks">Try again</Link>
      </Button>
    </main>
  );
}
