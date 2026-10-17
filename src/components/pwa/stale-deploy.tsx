"use client";

import { useEffect } from "react";
import { unstable_isUnrecognizedActionError as isStaleAction } from "next/navigation";
import { toast } from "sonner";

function offerReload() {
  toast("oobee was just updated", {
    id: "stale-deploy",
    description: "Reload to pick up the new version — that last action didn't go through.",
    action: { label: "Reload", onClick: () => window.location.reload() },
    duration: Infinity,
  });
}

/**
 * A tab left open across a deploy still holds the old build, whose server
 * actions the new server doesn't have: every like, follow and "load more"
 * fails until the page is reloaded. Those failures land here, from actions
 * called outside a form, and get the same "Reload" offer as a new service
 * worker — never a reload on its own, which would throw away a half-written
 * post. Actions called from a form reach app/error.tsx instead, which says
 * the same.
 */
export function StaleDeploy() {
  useEffect(() => {
    const onRejection = (e: PromiseRejectionEvent) => {
      if (isStaleAction(e.reason)) offerReload();
    };
    window.addEventListener("unhandledrejection", onRejection);
    return () => window.removeEventListener("unhandledrejection", onRejection);
  }, []);
  return null;
}
