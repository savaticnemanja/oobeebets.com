"use client";

import { recordPostViewsAction } from "@/app/actions/social";

/**
 * Counts a post as seen once it has been at least half on screen for a
 * second, and sends what's been seen in batches every few seconds (and when
 * the page is hidden). Each post is sent once per page load at most; the
 * server keeps one row per person per post anyway.
 */
const DWELL_MS = 1000;
const FLUSH_MS = 4000;

const sent = new Set<string>();
const queue = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  timer = null;
  if (queue.size === 0) return;
  const ids = [...queue].slice(0, 100);
  ids.forEach((id) => queue.delete(id));
  void recordPostViewsAction(ids).catch(() => {
    // A failed batch is dropped, not retried: a view count is not worth a
    // retry loop on a flaky connection.
  });
  if (queue.size > 0) timer = setTimeout(flush, FLUSH_MS);
}

function enqueue(id: string) {
  if (sent.has(id)) return;
  sent.add(id);
  queue.add(id);
  if (!timer) timer = setTimeout(flush, FLUSH_MS);
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}

/** Watches one element for one post; returns the cleanup. */
export function trackView(el: Element, postId: string): () => void {
  if (sent.has(postId) || typeof IntersectionObserver === "undefined") return () => {};
  let dwell: ReturnType<typeof setTimeout> | null = null;
  const io = new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting) {
        dwell ??= setTimeout(() => {
          enqueue(postId);
          io.disconnect();
        }, DWELL_MS);
      } else if (dwell) {
        clearTimeout(dwell);
        dwell = null;
      }
    },
    { threshold: 0.5 },
  );
  io.observe(el);
  return () => {
    if (dwell) clearTimeout(dwell);
    io.disconnect();
  };
}
