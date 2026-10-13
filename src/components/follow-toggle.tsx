"use client";

import { useTransition } from "react";
import { useKeptOptimistic } from "@/components/use-kept-optimistic";
import { Circle, CircleCheck } from "lucide-react";
import { toast } from "sonner";
import { setParlayFollowAction, setPickFollowAction } from "@/app/actions/follows";
import { FOLLOW_LABELS, type ViewerFollow } from "@/lib/follows";
import { cn } from "@/lib/utils";
import { PICK_STATE, type PickState } from "@/components/pick-state";
import { tryAction } from "@/lib/try-action";

/**
 * The check circle on the left of a pick card:
 *
 *   ○ Jalen Hurts — Over 24.5 Rush Yards     not taken
 *   ✓ Jalen Hurts — Over 24.5 Rush Yards     taken
 *
 * One tap, no form, no stake — the row it writes holds nothing but "this user,
 * this pick" (see pickFollows in db/schema.ts).
 *
 * Optimistic, so the tick lands on the frame of the tap, and kept once the
 * action succeeds (use-kept-optimistic.ts) — a ticket infinite scroll loaded
 * never gets a new prop, so without that it would untick itself. A failed
 * action reverts the circle on its own when the transition ends, which is why
 * the error path only has to say what went wrong.
 *
 * Deliberately shows no count of how many other testers took the pick. "Which
 * types of bets users follow most" is one of the questions this data is meant
 * to answer, and a visible tally would have the testers answering it to each
 * other instead — herding the dataset it exists to measure.
 */
export function FollowToggle({
  pickId,
  selection,
  follow,
  featured,
  state,
  kind = "pick",
}: {
  /** The pick's id — or the parlay's, with kind="parlay". */
  pickId: string;
  /** A parlay ticket logs "I played this parlay" (parlay_follows) instead. */
  kind?: "pick" | "parlay";
  /** Named in the control's label, so a screen reader knows which bet. */
  selection: string;
  follow: ViewerFollow;
  featured?: boolean;
  /** Under way or graded: the circle shows why it's locked (see pick-state.ts). */
  state?: PickState | null;
}) {
  const [taken, setTaken, keepTaken] = useKeptOptimistic(follow.taken);
  const [pending, startTransition] = useTransition();

  // Brand cyan for the checked state, not hit green. Green means "this pick
  // won" everywhere else on this very card, and "I took it" is a choice, not
  // a result — the two must not share a colour three inches apart. The circle
  // keeps its outline when checked rather than becoming a bare tick, so the
  // control does not change shape under the thumb that pressed it.
  const mark = (
    <span className={cn(featured ? "size-6" : "size-5", "grid place-items-center")}>
      {taken ? (
        <CircleCheck
          className={cn(featured ? "size-6" : "size-5", "fill-brand/15")}
          aria-hidden="true"
        />
      ) : (
        <Circle className={featured ? "size-6" : "size-5"} aria-hidden="true" />
      )}
    </span>
  );

  // 36px of target around a 20px circle, pulled back so the card's text still
  // starts where it did. mt-1 drops the circle onto the optical centre of the
  // headline's first line rather than the middle of a selection long enough
  // to wrap.
  const box = featured ? "size-10 -ml-1" : "size-9 -ml-1 -mt-1";

  // Past kick-off the fact is fixed, so it renders as a statement rather than a
  // control: still visible, so a tester can see what they logged, but there is
  // nothing left to press.
  //
  // A bare circle there would look like a control that simply doesn't
  // respond, so it shows the reason instead — a lock while the game is on,
  // then the result — in the colour the time line under the card uses for
  // the same thing. If you took the bet, that icon sits in your cyan ring.
  if (!follow.open) {
    if (state) {
      const s = PICK_STATE[state];
      const reason = state === "started" || state === "awaiting" ? FOLLOW_LABELS.started : s.label;
      const label = taken ? `${FOLLOW_LABELS.took} — ${reason}` : reason;
      return (
        <span className={cn("grid shrink-0 place-items-center", box)} title={label}>
          <span
            className={cn(
              "grid place-items-center rounded-full",
              featured ? "size-6" : "size-5",
              taken && "border-[1.5px] border-brand bg-brand/15",
              s.color,
            )}
          >
            <s.icon
              className={cn(taken ? (featured ? "size-3.5" : "size-3") : featured ? "size-5" : "size-4")}
              strokeWidth={taken ? 3 : 2.25}
              aria-hidden="true"
            />
          </span>
          <span className="sr-only">{label}</span>
        </span>
      );
    }
    const label = taken ? FOLLOW_LABELS.closedTaken : FOLLOW_LABELS.closedUntaken;
    return (
      <span
        className={cn(
          "grid shrink-0 place-items-center",
          box,
          taken ? "text-brand/60" : "text-fg-subtle/40",
        )}
        title={label}
      >
        {mark}
        <span className="sr-only">{label}</span>
      </span>
    );
  }

  function toggle() {
    const next = !taken;
    startTransition(async () => {
      setTaken(next);
      const result = await tryAction(() =>
        kind === "parlay" ? setParlayFollowAction(pickId, next) : setPickFollowAction(pickId, next),
      );
      if (result && !result.ok) toast.error(result.error);
      else keepTaken(next);
    });
  }

  return (
    <button
      type="button"
      // A checkbox, not a toggle button: the question is whether a fact is
      // true, not whether a mode is on. Space and Enter both activate it
      // because the element underneath is still a real <button>.
      role="checkbox"
      aria-checked={taken}
      aria-label={`${kind === "parlay" ? "I played this parlay" : FOLLOW_LABELS.take}: ${selection}`}
      title={kind === "parlay" ? (taken ? "You played this parlay" : "I played this parlay") : taken ? FOLLOW_LABELS.took : FOLLOW_LABELS.take}
      onClick={toggle}
      // Not `disabled` while pending: that drops focus out of the control
      // mid-interaction and makes a fast second tap feel broken. The action is
      // idempotent, so an extra click costs a round trip and nothing else.
      className={cn(
        "grid shrink-0 cursor-pointer place-items-center rounded-full transition-colors duration-200",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        box,
        taken ? "text-brand hover:text-brand-bright" : "text-fg-subtle hover:text-fg",
        pending && "opacity-70",
      )}
    >
      {mark}
    </button>
  );
}
