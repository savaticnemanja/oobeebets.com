"use client";

import { useEffect } from "react";

/**
 * On a phone, the top bar and the tab bar get out of the way as you read, as
 * on X: scrolling down slides them off, scrolling up brings them back — from
 * the first pixel either way, and pixel for pixel with the finger, over the
 * top bar's own height. Nothing animates on a timer; where they are is a
 * function of how far you have scrolled since you last changed direction.
 *
 * It writes two custom properties on <html>, and the pieces that move read
 * them in CSS (so there is no React render per scroll frame):
 *
 *   --chrome-hide  0 … top bar height, in px: how far the top bar is hidden.
 *                  Anything that sticks under the bar (feed tabs, the board's
 *                  day headers) subtracts it from its `top`, so it rides up
 *                  with the bar instead of leaving a gap.
 *   --chrome-p     0 … 1: the same as a fraction, for the tab bar and what
 *                  floats above it, which are a different height.
 *
 * The distance is the bar's visible height, not counting the notch padding,
 * so the strip under the status bar stays covered.
 *
 * From `sm` up there is no top bar or tab bar, and both stay at 0.
 */
export function ScrollChrome() {
  useEffect(() => {
    const root = document.documentElement;
    const phone = window.matchMedia("(max-width: 639.98px)");
    let hide = 0;
    let height = 0;
    let lastY = window.scrollY;

    const measure = () => {
      const bar = document.querySelector<HTMLElement>("[data-chrome-top]");
      if (!bar || !phone.matches) {
        height = 0;
        return;
      }
      const notch = Number.parseFloat(getComputedStyle(bar).paddingTop) || 0;
      height = bar.offsetHeight - notch;
    };

    const apply = () => {
      root.style.setProperty("--chrome-hide", `${hide}px`);
      root.style.setProperty("--chrome-p", height ? String(hide / height) : "0");
    };

    // Clamped to the real scroll range, so iOS's rubber-band past either end
    // doesn't read as a change of direction.
    const currentY = () => {
      const max = Math.max(0, root.scrollHeight - window.innerHeight);
      return Math.min(Math.max(window.scrollY, 0), max);
    };

    const onScroll = () => {
      const y = currentY();
      const delta = y - lastY;
      lastY = y;
      if (!height) return;
      const next = y <= 0 ? 0 : Math.min(height, Math.max(0, hide + delta));
      if (next !== hide) {
        hide = next;
        apply();
      }
    };

    const onResize = () => {
      measure();
      hide = Math.min(hide, height);
      lastY = currentY();
      apply();
    };

    measure();
    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    phone.addEventListener("change", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      phone.removeEventListener("change", onResize);
      root.style.removeProperty("--chrome-hide");
      root.style.removeProperty("--chrome-p");
    };
  }, []);

  return null;
}
