"use client";

import { useEffect } from "react";
import type Lenis from "lenis";

/**
 * Inertial wheel scrolling: a notch of the wheel sets a target and the page
 * eases toward it, instead of arriving the instant the wheel stops.
 *
 * Only the wheel is taken over. Touch keeps the momentum the OS already gives
 * it — animating a scroll the finger is still driving reads as lag, not as
 * smoothness — and the keyboard, scrollbar drags and fragment jumps all stay
 * native, so `scroll-padding-top` and the focus move the skip link depends on
 * keep working untouched.
 *
 * Nothing else in the app has to know this is here. Lenis follows the document's
 * real scroll position rather than replacing it with a transform, so the page
 * genuinely scrolls every frame and every IntersectionObserver, sticky header
 * and scroll listener behaves exactly as it did before.
 */
export function SmoothScroll() {
  useEffect(() => {
    // Trackpads and mice only, and only at desktop widths — a fine pointer on a
    // narrow viewport is usually a tablet with a keyboard case attached, where
    // the touchscreen is still the main way people scroll.
    const fine = window.matchMedia("(pointer: fine) and (min-width: 1024px)");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

    let lenis: Lenis | null = null;
    let loading = false;
    let mounted = true;

    const wanted = () => mounted && fine.matches && !reduced.matches;

    // Re-evaluated whenever either query flips, so plugging in a mouse or
    // turning on Reduce Motion takes effect without a reload.
    const sync = () => {
      if (!wanted()) {
        lenis?.destroy();
        lenis = null;
        return;
      }
      if (lenis || loading) return;

      // Kept out of the main bundle: no first paint depends on it, and the
      // clients that never qualify for it never pay to download it.
      loading = true;
      void import("lenis").then(({ default: LenisClass }) => {
        loading = false;
        // Either query can have flipped — or the component unmounted — while
        // the chunk was in flight.
        if (!wanted()) return;

        lenis = new LenisClass({
          duration: 1.1,
          // easeOutExpo. Most of the distance is covered in the first few
          // frames, so the page answers the wheel immediately and then settles;
          // an easing with a slow start would just feel unresponsive.
          easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
          smoothWheel: true,
          wheelMultiplier: 1,
          // Hands the gesture to whatever scroller sits under the pointer — a
          // dialog taller than the viewport, a table scrolling sideways — rather
          // than smoothing the page behind it while the thing being pointed at
          // stays put.
          allowNestedScroll: true,
          autoRaf: true,
        });
      });
    };

    sync();
    fine.addEventListener("change", sync);
    reduced.addEventListener("change", sync);

    return () => {
      mounted = false;
      fine.removeEventListener("change", sync);
      reduced.removeEventListener("change", sync);
      lenis?.destroy();
      lenis = null;
    };
  }, []);

  return null;
}
