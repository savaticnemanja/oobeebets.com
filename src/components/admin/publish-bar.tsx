"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { publishSlateAction, unpublishSlateAction } from "@/app/actions/admin";
import {
  CATEGORY_LABELS,
  PICKS_PER_SLATE,
  TOTAL_PICKS_PER_SLATE,
  pickCategories,
  type PickCategory,
} from "@/lib/board";

export function PublishBar({
  date,
  category,
  published,
  counts,
  anySettled,
}: {
  date: string;
  /** Carried through the date picker below, so changing the day keeps you on
   * the tab you were working in. */
  category: PickCategory;
  published: boolean;
  /** Both lists, because publishing sends them out together. */
  counts: Record<PickCategory, number>;
  anySettled: boolean;
}) {
  const router = useRouter();
  const [pubState, publish, publishing] = useActionState(publishSlateAction, null);
  const [unpubState, unpublish, unpublishing] = useActionState(unpublishSlateAction, null);

  useEffect(() => {
    const s = pubState ?? unpubState;
    if (s?.ok) toast.success(s.message ?? "Done");
    else if (s && !s.ok) toast.error(s.error);
  }, [pubState, unpubState]);

  // One bar for the day, not one per tab: publish is a single action over both
  // lists, so the thing worth showing is how close the whole slate is.
  const total = pickCategories.reduce((n, c) => n + counts[c], 0);
  const pct = Math.round((total / TOTAL_PICKS_PER_SLATE) * 100);

  return (
    <div className="card-hairline mt-6 p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            type="date"
            value={date}
            onChange={(e) => router.push(`/admin/slate?date=${e.target.value}&category=${category}`)}
            aria-label="Slate date"
            className="h-9 w-44 num"
          />
          {published ? (
            <Badge variant="hit">Live</Badge>
          ) : (
            <Badge variant="pending">Draft</Badge>
          )}
          <div className="flex items-center gap-3 text-sm text-fg-muted">
            {pickCategories.map((c) => (
              <span key={c} className="whitespace-nowrap">
                {CATEGORY_LABELS[c]}{" "}
                <span className="num text-fg">
                  {counts[c]}/{PICKS_PER_SLATE[c]}
                </span>
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {published ? (
            <form action={unpublish}>
              <input type="hidden" name="slateDate" value={date} />
              <Button
                type="submit"
                variant="outline"
                size="sm"
                disabled={unpublishing || anySettled}
                title={
                  anySettled
                    ? "Picks are settled — this slate is part of the public record"
                    : undefined
                }
              >
                {unpublishing ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <Undo2 aria-hidden="true" />
                )}
                Back to draft
              </Button>
            </form>
          ) : (
            <form action={publish}>
              <input type="hidden" name="slateDate" value={date} />
              <Button type="submit" size="sm" disabled={publishing || total === 0}>
                {publishing ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <Send aria-hidden="true" />
                )}
                Publish slate
              </Button>
            </form>
          )}
        </div>
      </div>

      <div
        className="mt-3 h-1 overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-valuenow={total}
        aria-valuemin={0}
        aria-valuemax={TOTAL_PICKS_PER_SLATE}
        aria-label="Slate completeness"
      >
        <div
          className="h-full rounded-full bg-brand transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
