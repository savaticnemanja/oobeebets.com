"use client";

import { useEffect } from "react";

/**
 * The ambient background blooms, plus their pointer parallax on desktop.
 *
 * All of the look lives in `.aurora*` in globals.css. This component's only job
 * is to publish the pointer position on <html> as two unitless custom
 * properties, `--aurora-x` / `--aurora-y`, each -1..1 from the viewport centre;
 * the blooms convert those into travel with their own `--depth`. Keeping the
 * offset in CSS is what lets the parallax coexist with the drift animation
 * instead of fighting it for the same `transform`.
 *
 * The markup is static, so this renders identically on the server and the
 * blooms are painted with the first frame, not after hydration.
 */
export function Aurora() {
  useEffect(() => {
    const root = document.documentElement;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

    // `x`/`y` chase `targetX`/`targetY`. That lag is the entire effect: the
    // blooms should feel like they are drifting after the cursor, not pinned
    // to it.
    let targetX = 0;
    let targetY = 0;
    let x = 0;
    let y = 0;
    let frame = 0;

    const tick = () => {
      // ~6% of the remaining distance per frame — a soft ease that reads as
      // weight, and settles well under a second.
      x += (targetX - x) * 0.06;
      y += (targetY - y) * 0.06;
      root.style.setProperty("--aurora-x", x.toFixed(4));
      root.style.setProperty("--aurora-y", y.toFixed(4));
      // Stop once the remaining travel is far under a pixel. An idle page —
      // which is most of them, the pointer stops the moment someone reads —
      // costs nothing at all.
      const remaining = Math.abs(targetX - x) + Math.abs(targetY - y);
      frame = remaining > 0.0005 ? requestAnimationFrame(tick) : 0;
    };

    const start = () => {
      if (!frame) frame = requestAnimationFrame(tick);
    };

    const onMove = (event: PointerEvent) => {
      targetX = (event.clientX / window.innerWidth) * 2 - 1;
      targetY = (event.clientY / window.innerHeight) * 2 - 1;
      start();
    };

    // Pointer left the window entirely: ease home rather than freezing the
    // blooms wherever the cursor happened to exit.
    const recentre = () => {
      targetX = 0;
      targetY = 0;
      start();
    };

    // Re-evaluated whenever either query flips — plugging in a mouse, or
    // turning on Reduce Motion, both take effect without a reload.
    const sync = () => {
      window.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerleave", recentre);
      window.removeEventListener("blur", recentre);

      if (!fine.matches || reduced.matches) {
        recentre();
        return;
      }
      window.addEventListener("pointermove", onMove, { passive: true });
      root.addEventListener("pointerleave", recentre);
      window.addEventListener("blur", recentre);
    };

    sync();
    fine.addEventListener("change", sync);
    reduced.addEventListener("change", sync);

    return () => {
      fine.removeEventListener("change", sync);
      reduced.removeEventListener("change", sync);
      window.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerleave", recentre);
      window.removeEventListener("blur", recentre);
      cancelAnimationFrame(frame);
      root.style.removeProperty("--aurora-x");
      root.style.removeProperty("--aurora-y");
    };
  }, []);

  return (
    <div className="aurora" aria-hidden="true">
      <div className="aurora-blob aurora-blob-a" />
      <div className="aurora-blob aurora-blob-b" />
      <div className="aurora-blob aurora-blob-c" />
      <div className="aurora-blob aurora-blob-d" />
    </div>
  );
}
