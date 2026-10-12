"use client";

import { Fragment, useCallback, useEffect, useRef, useState, useTransition } from "react";

export interface Chunk {
  node: React.ReactNode;
  /** Cursor for the chunk after this one; null when there is nothing older. */
  next: string | null;
}

/**
 * Infinite scroll in place of "Show older …" links. Watches a sentinel below
 * the list and, once it comes within about a screen of the viewport, asks the
 * server for the next chunk — rendered there, by the same components as the
 * first page, so a loaded row is indistinguishable from one that came with it.
 *
 * `load` is a server action bound to whatever it needs besides the cursor.
 * Give this a `key` per list (tab, profile) so switching lists starts over.
 */
export function LoadMore({ next, load }: { next: string | null; load: (cursor: string) => Promise<Chunk> }) {
  const [chunks, setChunks] = useState<React.ReactNode[]>([]);
  const [cursor, setCursor] = useState(next);
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();
  const sentinel = useRef<HTMLDivElement>(null);
  // Refs, not state: the observer can fire twice before a re-render, and a
  // `pending` check alone let the same chunk load (and render) twice.
  const busy = useRef(false);
  const requested = useRef(new Set<string>());

  const fetchMore = useCallback(
    (retry = false) => {
      if (!cursor || busy.current) return;
      if (requested.current.has(cursor) && !retry) return;
      busy.current = true;
      requested.current.add(cursor);
      setFailed(false);
      start(async () => {
        try {
          const chunk = await load(cursor);
          setChunks((c) => [...c, chunk.node]);
          setCursor(chunk.next);
        } catch {
          setFailed(true);
        } finally {
          busy.current = false;
        }
      });
    },
    [cursor, load],
  );

  // A fresh observer per cursor: observing fires once straight away, so a
  // chunk too short to push the sentinel off screen still pulls the next one.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !cursor || failed) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && fetchMore(), { rootMargin: "800px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [cursor, failed, fetchMore]);

  return (
    <>
      {chunks.map((node, i) => (
        <Fragment key={i}>{node}</Fragment>
      ))}
      {cursor && (
        <div ref={sentinel} aria-live="polite" className="py-6 text-center text-sm text-fg-subtle">
          {failed ? (
            <button type="button" onClick={() => fetchMore(true)} className="text-brand hover:underline">
              Couldn&apos;t load more — try again
            </button>
          ) : pending ? (
            "Loading…"
          ) : null}
        </div>
      )}
    </>
  );
}
