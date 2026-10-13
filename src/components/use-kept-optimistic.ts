"use client";

import { useOptimistic, useState } from "react";

/**
 * `useOptimistic` for a toggle whose row may never be re-rendered by the
 * server — a like, a tick, a vote.
 *
 * Plain `useOptimistic` shows the new value while the action runs, then falls
 * back to the prop, trusting the action's revalidation to deliver a new prop
 * that agrees. That holds for the first page of a list, which the page
 * re-renders. Rows that infinite scroll appended (components/load-more.tsx)
 * are a snapshot from a server action that nothing re-renders, so there the
 * like filled and then emptied again a moment later — though it was saved.
 *
 * This keeps what the server confirmed: call `keep(value)` once the action
 * succeeds, and that becomes the base the optimistic value settles into. A
 * failed action keeps nothing, so it still reverts on its own. A genuinely new
 * prop (the page re-rendered) replaces whatever was kept.
 */
export function useKeptOptimistic<T>(prop: T) {
  const [kept, setKept] = useState(prop);
  // Compared by value: callers pass small object literals, new every render.
  const [seen, setSeen] = useState(() => JSON.stringify(prop));
  const now = JSON.stringify(prop);
  if (now !== seen) {
    setSeen(now);
    setKept(prop);
  }
  const [value, setOptimistic] = useOptimistic(kept);
  return [value, setOptimistic, setKept] as const;
}
