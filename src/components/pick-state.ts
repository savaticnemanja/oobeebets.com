import { Ban, Check, Lock, Minus, X, type LucideIcon } from "lucide-react";
import type { PickStatus } from "@/db/schema";

/**
 * Where a pick is once its circle can no longer be tapped: under way, or
 * graded. The circle and the time line under the card both say it with the
 * same icon and colour, so a locked circle always comes with its reason.
 */
export type PickState = "started" | Exclude<PickStatus, "pending">;

export const PICK_STATE: Record<PickState, { icon: LucideIcon; color: string; label: string }> = {
  started: { icon: Lock, color: "text-pending", label: "Started" },
  won: { icon: Check, color: "text-hit", label: "Won" },
  lost: { icon: X, color: "text-miss", label: "Lost" },
  push: { icon: Minus, color: "text-fg-muted", label: "Push" },
  void: { icon: Ban, color: "text-void", label: "Void" },
};

/**
 * The badge in a pick's corner. "Pending" said nothing about whether the game
 * had even started, so an ungraded pick is split by kick-off: Upcoming before
 * it (a calm outline — nothing to see yet), Live after it (the lock's yellow,
 * with a pulsing dot) until it's graded. Graded picks say their result.
 */
export function pickBadge(state: PickState | null): {
  label: string;
  variant: "outline" | "pending" | "hit" | "miss" | "default" | "void";
  live?: boolean;
} {
  switch (state) {
    case null:
      return { label: "Upcoming", variant: "outline" };
    case "started":
      return { label: "Live", variant: "pending", live: true };
    case "won":
      return { label: PICK_STATE.won.label, variant: "hit" };
    case "lost":
      return { label: PICK_STATE.lost.label, variant: "miss" };
    case "push":
      return { label: PICK_STATE.push.label, variant: "default" };
    case "void":
      return { label: PICK_STATE.void.label, variant: "void" };
  }
}

/** `now` is passed in so callers decide when "now" is. */
export function pickState(pick: { status: PickStatus; startsAt: Date }, now: number): PickState | null {
  if (pick.status !== "pending") return pick.status;
  return pick.startsAt.getTime() <= now ? "started" : null;
}
