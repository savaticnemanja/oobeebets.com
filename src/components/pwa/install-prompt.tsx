"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "oobee_install_dismissed";

interface Env {
  iosSafari: boolean;
  installed: boolean;
  dismissed: boolean;
}

/**
 * Browser facts that cannot change after mount. Read through
 * useSyncExternalStore rather than an effect + setState, so there is no
 * cascading render and no SSR/client mismatch.
 *
 * The snapshot is cached because useSyncExternalStore compares by identity —
 * returning a fresh object each call would loop forever.
 */
let cachedEnv: Env | null = null;

function readEnv(): Env {
  cachedEnv ??= {
    iosSafari:
      /iphone|ipad|ipod/i.test(navigator.userAgent) &&
      !/crios|fxios/i.test(navigator.userAgent),
    installed: window.matchMedia("(display-mode: standalone)").matches,
    dismissed: localStorage.getItem(DISMISS_KEY) === "1",
  };
  return cachedEnv;
}

// On the server, assume installed: the prompt then only ever appears after
// hydration, on a client that genuinely can install.
const SERVER_ENV: Env = { iosSafari: false, installed: true, dismissed: true };
const readServerEnv = () => SERVER_ENV;
const noopSubscribe = () => () => {};

/**
 * Custom install affordance. Chrome fires `beforeinstallprompt` and lets us
 * defer it; iOS Safari never does, so it gets an instruction line instead.
 * Dismissal is remembered so this never becomes nagware.
 */
export function InstallPrompt() {
  const env = useSyncExternalStore(noopSubscribe, readEnv, readServerEnv);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const eligible = !env.installed && !env.dismissed && !dismissed;

  useEffect(() => {
    if (!eligible || env.iosSafari) return;

    const handler = (e: Event) => {
      e.preventDefault();
      // setState from an event callback — this is what effects are for.
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, [eligible, env.iosSafari]);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    dismiss();
  }

  // iOS gets instructions; everyone else waits for the real install event.
  if (!eligible) return null;
  if (!env.iosSafari && !deferred) return null;

  return (
    <div
      role="dialog"
      aria-label="Install oobee bets"
      className={cn(
        "fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md",
        "card-hairline bg-surface-2/95 p-4 backdrop-blur-md brand-glow",
        "[animation:var(--animate-rise)]",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-lg bg-brand/10 p-2 text-brand">
          <Download className="size-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-fg">Install oobee bets</p>
          <p className="mt-0.5 text-xs text-fg-muted">
            {env.iosSafari
              ? "Tap Share, then “Add to Home Screen” for the full-screen app."
              : "Get the board on your home screen. Opens instantly, no browser bars."}
          </p>
          {!env.iosSafari && (
            <Button size="sm" className="mt-3" onClick={install}>
              Install
            </Button>
          )}
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss install prompt"
          className="rounded-md p-1 text-fg-subtle transition-colors hover:bg-surface-3 hover:text-fg"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
