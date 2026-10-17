"use client";

import * as React from "react";

/**
 * Scrolls a horizontally scrolling tab strip so its current tab
 * (`aria-current="page"`) is in view — on a phone the last tab of four is
 * otherwise off the edge, selected and invisible. Render it inside the strip.
 */
export function ScrollActiveTab() {
  const ref = React.useRef<HTMLSpanElement>(null);
  React.useEffect(() => {
    const strip = ref.current?.parentElement;
    const active = strip?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!strip || !active) return;
    // A 16px margin, so it doesn't land flush against the screen edge.
    const margin = 16;
    const overflowRight = active.offsetLeft + active.offsetWidth + margin - (strip.scrollLeft + strip.clientWidth);
    if (overflowRight > 0) strip.scrollLeft += overflowRight;
    else if (active.offsetLeft - margin < strip.scrollLeft) strip.scrollLeft = Math.max(0, active.offsetLeft - margin);
  }, []);
  return <span ref={ref} hidden />;
}
