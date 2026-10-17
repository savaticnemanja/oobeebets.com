"use client";

import { useEffect } from "react";
import { toast } from "sonner";

/**
 * Registers the service worker and surfaces updates.
 *
 * A betting app that silently serves an old bundle is a support ticket, so a
 * new worker waits (public/sw.js) and the page offers "Reload". It never
 * reloads on its own: that would throw away whatever is being typed — a post,
 * a half-filled signup form. Only the tab where Reload is pressed reloads;
 * any other tab carries on, and picks up the new version on its next page.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;
    let reloadOnTakeover = false;

    const onControllerChange = () => {
      if (reloadOnTakeover) window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    const offer = (worker: ServiceWorker) => {
      toast("A new version is ready", {
        id: "sw-update",
        action: {
          label: "Reload",
          onClick: () => {
            reloadOnTakeover = true;
            worker.postMessage("SKIP_WAITING");
          },
        },
        duration: Infinity,
      });
    };

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        if (cancelled) return;
        // Only an update is worth a word: the very first worker has no
        // controller to replace, and takes over quietly.
        if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) offer(installing);
          });
        });
      })
      .catch(() => {
        // A failed SW registration must never break the page.
      });

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  return null;
}
