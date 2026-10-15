"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { cameBack } from "@/components/nav-memory";

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
 *
 * Coming back to the list — the back button from a post, say — puts back
 * every chunk it had loaded and the scroll position it was at, as X does.
 * Without it the page came back with its first chunk only, and the reader
 * at the top of it. Opening the page afresh (a nav tap) starts over.
 */

interface Remembered {
  /** The first page's cursor: chunks only fit back under the same first page. */
  firstNext: string | null;
  chunks: React.ReactNode[];
  cursor: string | null;
  y: number;
  /** The row at the top of the screen ([data-anchor]) and how far down it sat. */
  anchor: { id: string; top: number } | null;
}

/** The first row on screen, by its data-anchor (PostCard sets one). */
function topRow(): { id: string; top: number } | null {
  for (const el of document.querySelectorAll<HTMLElement>("[data-anchor]")) {
    const r = el.getBoundingClientRect();
    if (r.bottom > 64) return { id: el.dataset.anchor!, top: r.top };
  }
  return null;
}

/** Puts that row back where it was — or, failing that, the raw offset. */
function scrollBack(saved: Pick<Remembered, "y" | "anchor">) {
  const el = saved.anchor ? document.querySelector<HTMLElement>(`[data-anchor="${CSS.escape(saved.anchor.id)}"]`) : null;
  if (el && saved.anchor) window.scrollBy(0, el.getBoundingClientRect().top - saved.anchor.top);
  else window.scrollTo(0, saved.y);
}

/** Per URL, for as long as the tab lives — what a list had loaded, and where you were. */
const memory = new Map<string, Remembered>();

/**
 * What to start from: the remembered list when coming back to it, else
 * nothing. Safe as initial state: a back navigation renders on the client
 * only, and a full page load (the one time the server's HTML is hydrated)
 * never counts as coming back — so server and client always agree.
 */
function recall(): { key: string | null; saved: Remembered | null } {
  if (typeof window === "undefined") return { key: null, saved: null };
  const key = window.location.pathname + window.location.search;
  const saved = memory.get(key);
  return { key, saved: saved && cameBack() ? saved : null };
}

export function LoadMore({ next, load }: { next: string | null; load: (cursor: string) => Promise<Chunk> }) {
  const [initial] = useState(recall);
  // Chunks only fit back under the first page they followed.
  const fits = initial.saved !== null && initial.saved.firstNext === next;
  const [chunks, setChunks] = useState<React.ReactNode[]>(fits ? initial.saved!.chunks : []);
  const [cursor, setCursor] = useState(fits ? initial.saved!.cursor : next);
  const [restoreTo, setRestoreTo] = useState<Pick<Remembered, "y" | "anchor"> | null>(
    initial.saved ? { y: initial.saved.y, anchor: initial.saved.anchor } : null,
  );
  const pageKey = useRef<string | null>(initial.key);
  // The page above can re-render under this — an action revalidated it, say
  // a post went up — and hand down a new `next`. Until a chunk has loaded,
  // that one is right and the old one is not: the first page now ends
  // somewhere else, and continuing from where it used to end skips or
  // repeats rows. Once chunks are showing, they carry on from their own.
  const [seenNext, setSeenNext] = useState(next);
  if (next !== seenNext) {
    setSeenNext(next);
    if (chunks.length === 0) setCursor(next);
  }
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();
  const sentinel = useRef<HTMLDivElement>(null);
  // Refs, not state: the observer can fire twice before a re-render, and a
  // `pending` check alone let the same chunk load (and render) twice.
  const busy = useRef(false);
  const requested = useRef(new Set<string>());

  // Opened afresh: forget what this page had before.
  useEffect(() => {
    if (!initial.saved && initial.key) {
      memory.set(initial.key, { firstNext: next, chunks: [], cursor: next, y: window.scrollY, anchor: null });
    }
    // Once, on the way in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Where you are: the row at the top as you scroll — and, when you tap a
  // row (to open a post, usually), that row, which is the one you'll look
  // for when you come back. A tap's anchor isn't overwritten by the scroll
  // the navigation itself may cause on the way out.
  useEffect(() => {
    let frame = 0;
    let tappedAt = 0;
    const saved = () => (pageKey.current ? memory.get(pageKey.current) : undefined);
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const s = saved();
        if (s && performance.now() - tappedAt > 1000) Object.assign(s, { y: window.scrollY, anchor: topRow() });
      });
    };
    const onTap = (e: Event) => {
      const row = (e.target as Element | null)?.closest<HTMLElement>("[data-anchor]");
      const s = saved();
      if (!row || !s) return;
      tappedAt = performance.now();
      Object.assign(s, { y: window.scrollY, anchor: { id: row.dataset.anchor!, top: row.getBoundingClientRect().top } });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    // pointerdown as well as click: it comes first, before anything the tap starts can move the page.
    document.addEventListener("pointerdown", onTap, true);
    document.addEventListener("click", onTap, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("pointerdown", onTap, true);
      document.removeEventListener("click", onTap, true);
    };
  }, []);

  // What's loaded, as it loads.
  useEffect(() => {
    const saved = pageKey.current ? memory.get(pageKey.current) : undefined;
    if (saved) Object.assign(saved, { firstNext: next, chunks, cursor });
  }, [chunks, cursor, next]);

  // Back to the spot, once the chunks are on the page — and held there for
  // a moment, because the page keeps settling (images, the browser's own
  // scroll restoration) for a few frames after. Anything the reader does
  // lets go at once.
  useLayoutEffect(() => {
    if (restoreTo === null) return;
    scrollBack(restoreTo);
    let frame = 0;
    let stopped = false;
    // Long enough for a slow phone to finish laying the page out.
    const until = performance.now() + 1500;
    const stop = () => {
      stopped = true;
    };
    const hold = () => {
      if (stopped || performance.now() > until) return setRestoreTo(null);
      scrollBack(restoreTo);
      frame = requestAnimationFrame(hold);
    };
    frame = requestAnimationFrame(hold);
    for (const ev of ["wheel", "touchstart", "keydown", "pointerdown"]) window.addEventListener(ev, stop, { once: true, passive: true });
    return () => {
      cancelAnimationFrame(frame);
      for (const ev of ["wheel", "touchstart", "keydown", "pointerdown"]) window.removeEventListener(ev, stop);
    };
  }, [restoreTo]);

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
          // A second transition: React forgets the first one across an
          // await, so these updates would land as urgent. The chunk can
          // suspend while it renders (its client components' code still
          // loading), and an urgent update that suspends shows the page's
          // loading.tsx skeleton in place of the whole page — one screen tall,
          // so the browser dropped the reader back at the top every time a
          // chunk came in. In a transition, the page stays put until the
          // chunk is ready.
          start(() => {
            setChunks((c) => [...c, chunk.node]);
            setCursor(chunk.next);
          });
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
