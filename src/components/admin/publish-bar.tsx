"use client";

import { useActionState, useEffect, useState } from "react";
import { CircleCheck, Circle, Loader2, Send, Star, TriangleAlert, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/misc";
import { LocalTime } from "@/components/local-time";
import { publishSlateAction, unpublishSlateAction } from "@/app/actions/admin";
import { CATEGORY_LABELS, CATEGORY_NOUN, PARLAYS_PER_SLATE, PICKS_PER_SLATE, pickCategories, type PickCategory } from "@/lib/board";
import { cn } from "@/lib/utils";

/**
 * The day's state and its one big action. A slate is a single thing that
 * goes out whole — game bets, props and Oobee's parlays together — so this
 * sits above the tabs, not inside one. Publishing asks first and says what
 * it means: from then on the picks can't be edited, only voided.
 */
export function PublishPanel({
  date,
  dayLabel,
  published,
  publishedAt,
  counts,
  parlays,
  featured,
  firstKickoff,
  anySettled,
  anyStarted,
}: {
  date: string;
  /** "Sunday, Oct 19". */
  dayLabel: string;
  published: boolean;
  publishedAt: Date | null;
  counts: Record<PickCategory, number>;
  parlays: number;
  featured: number;
  /** The earliest kick-off among the day's picks, else its games. */
  firstKickoff: Date | null;
  anySettled: boolean;
  /** A game has kicked off: a published slate is on the record, and a draft
   *  can't go out until those picks are gone. */
  anyStarted: boolean;
}) {
  const [pubState, publish, publishing] = useActionState(publishSlateAction, null);
  const [unpubState, unpublish, unpublishing] = useActionState(unpublishSlateAction, null);
  const [confirm, setConfirm] = useState<"publish" | "unpublish" | null>(null);

  useEffect(() => {
    const s = pubState ?? unpubState;
    if (s?.ok) toast.success(s.message ?? "Done");
    else if (s && !s.ok) toast.error(s.error);
  }, [pubState, unpubState]);

  const picks = pickCategories.reduce((n, c) => n + counts[c], 0);
  // Anything at all — a day can go out with only parlays on it.
  const total = picks + parlays;
  const locked = anySettled || anyStarted;
  const lines = [
    ...pickCategories.map((c) => ({ key: c, label: CATEGORY_LABELS[c], n: counts[c], of: PICKS_PER_SLATE[c] })),
    { key: "parlay", label: "Parlays", n: parlays, of: PARLAYS_PER_SLATE },
  ];
  const breakdown = [
    ...pickCategories.filter((c) => counts[c] > 0).map((c) => `${counts[c]} ${CATEGORY_NOUN[c]}${counts[c] === 1 ? "" : "s"}`),
    parlays > 0 ? `${parlays} parlay${parlays === 1 ? "" : "s"}` : null,
  ].filter(Boolean);

  return (
    <section
      aria-label="Slate status"
      className={cn(
        "card-hairline mb-6 overflow-hidden",
        published ? "border-hit/25" : total > 0 ? "border-pending/30" : undefined,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">{dayLabel}</h2>
            {published ? <Badge variant="hit">Live</Badge> : <Badge variant="pending">Draft</Badge>}
          </div>
          <p className="mt-1 text-sm text-fg-muted">
            {published && publishedAt ? (
              <>
                Published <LocalTime at={publishedAt} format="datetime" /> — every tester can see it. Featuring still works;
                anything else is a void on Settle.
              </>
            ) : total === 0 ? (
              "Nothing on it yet. Add game bets, props or parlays from the feed below."
            ) : firstKickoff ? (
              <>
                Publish before the first kick-off: <LocalTime at={firstKickoff} format="kickoff" />.
              </>
            ) : (
              "Testers can't see a draft until it's published."
            )}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {published ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={unpublishing || locked}
              onClick={() => setConfirm("unpublish")}
              title={
                anySettled
                  ? "Picks are settled — this slate is part of the public record"
                  : anyStarted
                    ? "A game has started — this slate is part of the public record. Void a pick instead."
                    : undefined
              }
            >
              {unpublishing ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Undo2 aria-hidden="true" />}
              Back to draft
            </Button>
          ) : (
            <Button type="button" disabled={publishing || total === 0 || locked} onClick={() => setConfirm("publish")}>
              {publishing ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Send aria-hidden="true" />}
              Publish slate
            </Button>
          )}
        </div>
      </div>

      {/* what's on it — a checklist, not a quota: a short game day is a finished one */}
      <ul className="flex flex-wrap gap-x-6 gap-y-2 border-t border-border bg-white/[0.015] px-4 py-3 text-sm sm:px-5">
        {lines.map((l) => (
          <li key={l.key} className="flex items-center gap-2">
            {l.n > 0 ? (
              <CircleCheck className="size-4 text-hit" aria-hidden="true" />
            ) : (
              <Circle className="size-4 text-fg-subtle" aria-hidden="true" />
            )}
            <span className={l.n > 0 ? "text-fg" : "text-fg-muted"}>{l.label}</span>
            <span className="num text-fg-subtle">
              {l.n}/{l.of}
            </span>
          </li>
        ))}
        <li className="flex items-center gap-2">
          <Star className={cn("size-4", featured > 0 ? "fill-brand/30 text-brand" : "text-fg-subtle")} aria-hidden="true" />
          <span className={featured > 0 ? "text-fg" : "text-fg-muted"}>Featured</span>
          <span className="num text-fg-subtle">{featured}</span>
        </li>
      </ul>

      {!published && locked && (
        <p className="flex items-start gap-2 border-t border-pending/20 bg-pending-dim px-4 py-3 text-sm text-pending sm:px-5">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Some picks or parlay legs on this draft have already started. A slate goes public only before its games —
          delete those picks or parlays, then publish the rest.
        </p>
      )}

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          {confirm === "publish" ? (
            <>
              <AlertDialogTitle>Publish {dayLabel}?</AlertDialogTitle>
              <AlertDialogDescription>
                {breakdown.join(", ")} go live to every tester now. Published picks can&apos;t be edited, reordered or
                removed — a mistake becomes a void on Settle. You can still feature or unfeature them.
              </AlertDialogDescription>
              <AlertDialogFooter>
                <AlertDialogCancel asChild>
                  <Button type="button" variant="outline">
                    Not yet
                  </Button>
                </AlertDialogCancel>
                <form action={publish} onSubmit={() => setConfirm(null)}>
                  <input type="hidden" name="slateDate" value={date} />
                  <Button type="submit">
                    <Send aria-hidden="true" />
                    Publish
                  </Button>
                </form>
              </AlertDialogFooter>
            </>
          ) : (
            <>
              <AlertDialogTitle>Take {dayLabel} back to draft?</AlertDialogTitle>
              <AlertDialogDescription>
                It disappears from the board for testers until you publish it again. Nothing has started yet, so
                nothing is lost from the record.
              </AlertDialogDescription>
              <AlertDialogFooter>
                <AlertDialogCancel asChild>
                  <Button type="button" variant="outline">
                    Keep it live
                  </Button>
                </AlertDialogCancel>
                <form action={unpublish} onSubmit={() => setConfirm(null)}>
                  <input type="hidden" name="slateDate" value={date} />
                  <Button type="submit" variant="danger">
                    <Undo2 aria-hidden="true" />
                    Back to draft
                  </Button>
                </form>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
