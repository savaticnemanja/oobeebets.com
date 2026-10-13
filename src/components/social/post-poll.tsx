"use client";

import { useTransition } from "react";
import { useKeptOptimistic } from "@/components/use-kept-optimistic";
import { CircleCheck } from "lucide-react";
import { toast } from "sonner";
import { votePollAction } from "@/app/actions/social";
import type { PollView } from "@/lib/social";
import { cn } from "@/lib/utils";
import { tryAction } from "@/lib/try-action";

function timeLeft(endsAt: Date): string {
  const ms = endsAt.getTime() - Date.now();
  if (ms <= 0) return "Final results";
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}m left`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h left`;
  return `${Math.round(h / 24)}d left`;
}

/**
 * A poll, as on X: choices to tap while it's open and you haven't voted;
 * after that — or for its author, or once it closes — the bars, with your
 * choice ticked and the leader in bold.
 */
export function PostPoll({
  postId,
  poll,
  viewerId,
  authorId,
}: {
  postId: string;
  poll: PollView;
  viewerId: string | null;
  authorId: string;
}) {
  const [state, setState, keep] = useKeptOptimistic({ myVote: poll.myVote, options: poll.options, total: poll.total });
  const [pending, startTransition] = useTransition();
  // eslint-disable-next-line react-hooks/purity -- re-evaluated per render on purpose: a poll closes while you look at it
  const closed = poll.endsAt.getTime() <= Date.now();
  const showResults = closed || state.myVote !== null || viewerId === authorId || !viewerId;
  const top = Math.max(...state.options.map((o) => o.votes));

  function vote(optionId: string) {
    startTransition(async () => {
      const value = {
        myVote: optionId,
        options: state.options.map((o) => (o.id === optionId ? { ...o, votes: o.votes + 1 } : o)),
        total: state.total + 1,
      };
      setState(value);
      const result = await tryAction(() => votePollAction(postId, optionId));
      if (result && !result.ok) toast.error(result.error);
      else keep(value);
    });
  }

  return (
    <div className="mt-3 space-y-2" onClick={(e) => e.stopPropagation()}>
      {state.options.map((o) => {
        if (!showResults) {
          return (
            <button
              key={o.id}
              type="button"
              disabled={pending}
              onClick={() => vote(o.id)}
              className="block w-full rounded-full border border-brand/60 px-4 py-1.5 text-center text-[0.9375rem] font-semibold text-brand transition-colors hover:bg-brand/10"
            >
              {o.label}
            </button>
          );
        }
        const pct = state.total ? Math.round((o.votes / state.total) * 100) : 0;
        const lead = o.votes === top && top > 0;
        return (
          <div key={o.id} className="relative flex items-center justify-between overflow-hidden rounded-md px-3 py-1.5 text-[0.9375rem]">
            <span
              className={cn("absolute inset-y-0 left-0 rounded-md", lead ? "bg-brand/35" : "bg-surface-3")}
              style={{ width: `${Math.max(pct, 1)}%` }}
              aria-hidden="true"
            />
            <span className={cn("relative flex items-center gap-1.5", lead && "font-bold")}>
              {o.label}
              {state.myVote === o.id && <CircleCheck className="size-4 text-fg" aria-label="Your vote" />}
            </span>
            <span className={cn("num relative", lead && "font-bold")}>{pct}%</span>
          </div>
        );
      })}
      <p className="text-sm text-fg-subtle" suppressHydrationWarning>
        {state.total} vote{state.total === 1 ? "" : "s"} · {timeLeft(poll.endsAt)}
      </p>
    </div>
  );
}
