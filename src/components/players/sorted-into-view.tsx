"use client";

import * as React from "react";

/**
 * On a phone the sorted column is often off to the right of the pinned
 * names — passing yards is the fifth column. This scrolls the table's own
 * box (not the page) so that column sits just right of the names on load.
 * Rendered inside the scroller (stats-grid.tsx); does nothing when the
 * column is already in view.
 */
export function SortedIntoView() {
  const ref = React.useRef<HTMLSpanElement>(null);
  React.useEffect(() => {
    const scroller = ref.current?.closest<HTMLElement>("[data-grid-scroller]");
    const header = scroller?.querySelector<HTMLElement>('[role="columnheader"][aria-sort]');
    if (!scroller || !header) return;
    // Screen positions, so nesting and offsetParents don't matter: where the
    // pinned columns end, and where the sorted one sits.
    const box = scroller.getBoundingClientRect();
    const pinnedRight = Math.max(
      box.left,
      ...[...scroller.querySelectorAll<HTMLElement>('[role="columnheader"].sticky')].map((h) => h.getBoundingClientRect().right),
    );
    const col = header.getBoundingClientRect();
    if (col.left >= pinnedRight && col.right <= box.right) return;
    scroller.scrollLeft += col.left - pinnedRight - 8;
  }, []);
  return <span ref={ref} hidden />;
}
