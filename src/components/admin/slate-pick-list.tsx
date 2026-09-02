"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { GripVertical, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { deletePickAction, reorderPicksAction } from "@/app/actions/admin";
import type { Pick } from "@/db/schema";
import { CATEGORY_NOUN, VISIBLE_PICKS, type PickCategory } from "@/lib/board";
import { cn } from "@/lib/utils";
import { SPORT_EMOJI, STATUS_LABEL, STATUS_VARIANT } from "@/components/pick-card";
import { formatDateTime, formatOdds } from "@/lib/i18n/format";

export function SlatePickList({
  date,
  category,
  picks,
  published,
}: {
  date: string;
  /** The list being dragged. Ranks are per-category, so a reorder must say
   * which of the two it is renumbering. */
  category: PickCategory;
  picks: Pick[];
  published: boolean;
}) {
  const [deleteState, deleteAction] = useActionState(deletePickAction, null);
  const [items, setItems] = useState(picks);
  const [isSaving, startSave] = useTransition();

  // The server is the source of truth — a delete, a settle, or another admin
  // reordering elsewhere all land here as a fresh `picks` prop. Render-phase
  // set (not an effect) so there's no extra commit and no flash of the old
  // order — same pattern as the composer's rank auto-advance used to use.
  const [lastPicks, setLastPicks] = useState(picks);
  if (lastPicks !== picks) {
    setLastPicks(picks);
    setItems(picks);
  }

  useEffect(() => {
    if (deleteState?.ok) toast.success(deleteState.message ?? "Removed");
    else if (deleteState && !deleteState.ok) toast.error(deleteState.error);
  }, [deleteState]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((p) => p.id === active.id);
    const newIndex = items.findIndex((p) => p.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(items, oldIndex, newIndex);
    setItems(reordered);

    startSave(async () => {
      const res = await reorderPicksAction(
        date,
        category,
        reordered.map((p) => p.id),
      );
      if (res && !res.ok) {
        toast.error(res.error);
        setItems(picks); // revert — the server rejected the new order
      }
    });
  }

  if (items.length === 0) {
    return (
      <div className="card-hairline flex min-h-64 items-center justify-center p-8 text-center">
        <p className="text-sm text-fg-muted">
          No {CATEGORY_NOUN[category]}s on this slate yet. Add one to start.
        </p>
      </div>
    );
  }

  return (
    <div>
      {isSaving && <p className="mb-2 text-xs text-fg-subtle">Saving order…</p>}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items.map((p) => p.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {items.map((p, i) => (
              <SortableRow
                key={p.id}
                pick={p}
                rank={i + 1}
                freeLimit={VISIBLE_PICKS[category]}
                published={published}
                deleteAction={deleteAction}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function SortableRow({
  pick,
  rank,
  freeLimit,
  published,
  deleteAction,
}: {
  pick: Pick;
  rank: number;
  freeLimit: number;
  published: boolean;
  deleteAction: (formData: FormData) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: pick.id,
    disabled: published,
  });

  const visible = rank <= freeLimit;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "card-hairline flex items-start gap-3 border-l-2 p-3",
        visible ? "border-l-brand" : "border-l-border",
        isDragging && "z-10 opacity-90 shadow-lg",
      )}
    >
      {!published && (
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Drag to reorder pick ${rank}`}
          className="mt-0.5 shrink-0 touch-none text-fg-subtle hover:text-fg"
        >
          <GripVertical className="size-4" aria-hidden="true" />
        </button>
      )}
      <span className="num mt-0.5 w-7 shrink-0 text-sm font-semibold text-fg-subtle">
        #{rank}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span aria-hidden="true">{SPORT_EMOJI[pick.sport]}</span>
          <span className="font-medium text-fg">{pick.selection}</span>
          <span className="num text-sm text-fg-muted">{formatOdds(pick.price)}</span>
          <Badge variant={STATUS_VARIANT[pick.status]}>{STATUS_LABEL[pick.status]}</Badge>
          {!visible && <Badge variant="outline">admin only</Badge>}
        </div>
        <p className="mt-0.5 truncate text-xs text-fg-muted">
          {pick.league} · {pick.event}
        </p>
        <p className="num mt-0.5 text-[0.6875rem] text-fg-subtle">
          {Number(pick.units).toFixed(2)}u
          {pick.confidence !== null && ` · ${pick.confidence}% conf`}
          {" · "}
          {formatDateTime(pick.startsAt)}
        </p>
      </div>

      {!published && (
        <form action={deleteAction}>
          <input type="hidden" name="pickId" value={pick.id} />
          <Button
            type="submit"
            variant="ghost"
            size="icon"
            aria-label={`Remove pick ${rank}`}
            className="text-fg-subtle hover:text-miss"
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </form>
      )}
    </div>
  );
}
