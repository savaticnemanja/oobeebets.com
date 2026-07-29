"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

/**
 * Registers the service worker and surfaces updates.
 *
 * A betting app that silently serves an old bundle is a support ticket, so a
 * waiting worker prompts the user rather than activating on its own schedule.
 */
export function ServiceWorker() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  /**
   * Whether this page was already under a worker's control. Read before
   * registering, because registration is what changes the answer.
   */
  const hadController = useRef(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    hadController.current = Boolean(navigator.serviceWorker.controller);

    let cancelled = false;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        if (cancelled) return;
        setRegistration(reg);

        reg.addEventListener("updatefound", () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              toast("A new version is ready", {
                action: {
                  label: "Reload",
                  onClick: () => {
                    installing.postMessage("SKIP_WAITING");
                    window.location.reload();
                  },
                },
                duration: Infinity,
              });
            }
          });
        });
      })
      .catch(() => {
        // A failed SW registration must never break the page.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Reload once when a *new* worker takes control, so assets stay consistent.
  useEffect(() => {
    if (!registration) return;
    let reloading = false;
    const onChange = () => {
      // On a first visit the worker installs and immediately calls
      // clients.claim(), which fires this event for a page that was never
      // stale. Reloading there throws away whatever the visitor has typed —
      // a half-filled signup form, most expensively. Absorb that first claim
      // and only reload for genuine replacements afterwards.
      if (!hadController.current) {
        hadController.current = true;
        return;
      }
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker?.addEventListener("controllerchange", onChange);
    return () => navigator.serviceWorker?.removeEventListener("controllerchange", onChange);
  }, [registration]);

  return null;
}
