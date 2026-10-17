"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { LinePicker } from "@/components/odds/line-picker";
import { createPickAction } from "@/app/actions/admin";
import type { GameOption, LineOption } from "@/lib/odds/markets";
import type { FeedStatus } from "@/lib/odds/sync";
import { formatOdds } from "@/lib/i18n/format";
import {
  CATEGORY_NOUN,
  MAX_UNITS,
  PICKS_PER_SLATE,
  VISIBLE_PICKS,
  type PickCategory,
} from "@/lib/board";

/**
 * Adding a pick: choose a line from the odds feed, then say how much you like
 * it. The bet itself — teams, kick-off, selection, price, book — is never
 * typed; it comes off the feed line and is frozen when the pick is saved
 * (createPickAction → freezeLine). What the admin supplies is the opinion:
 * stake, confidence, edge and the write-up.
 *
 * Rank is never typed either — a new pick lands on the next free slot in its
 * category; reordering happens by dragging rows in the list beside this.
 */
export function PickComposer({
  date,
  category,
  pickCount,
  disabled,
  games,
  feed,
}: {
  date: string;
  category: PickCategory;
  pickCount: number;
  disabled: boolean;
  games: GameOption[];
  feed: FeedStatus;
}) {
  const [state, action, pending] = useActionState(createPickAction, null);
  const [chosen, setChosen] = React.useState<{ option: LineOption; game: GameOption } | null>(null);
  const formRef = React.useRef<HTMLFormElement>(null);
  const router = useRouter();

  const isProp = category === "prop";
  const limit = PICKS_PER_SLATE[category];
  const freeLimit = VISIBLE_PICKS[category];

  // Render-phase reset, so clearing on success costs no extra effect pass.
  const [lastHandledState, setLastHandledState] = React.useState(state);
  if (state !== lastHandledState) {
    setLastHandledState(state);
    if (state?.ok) setChosen(null);
  }

  React.useEffect(() => {
    if (state?.ok) {
      toast.success(state.message ?? "Pick added");
      const form = formRef.current;
      if (form) {
        for (const name of ["confidence", "evPct", "reasoning"]) {
          const el = form.elements.namedItem(name) as HTMLInputElement | null;
          if (el) el.value = "";
        }
      }
    } else if (state && !state.ok) {
      toast.error(state.error);
      // A moved price or a pulled line: show the feed as it is now.
      router.refresh();
    }
  }, [state, router]);

  // Driven by hand rather than `action={action}`: React resets an
  // uncontrolled form once its action settles, which would wipe the write-up
  // whenever the submit came back refused.
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    React.startTransition(() => action(formData));
  }

  if (disabled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Slate is published</CardTitle>
          <CardDescription>
            Published picks are immutable — that&apos;s what makes the track record
            worth anything. To correct one, void it on the Settle screen.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const nextPick = pickCount + 1;
  const visible = nextPick <= freeLimit;
  const full = pickCount >= limit;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add a {CATEGORY_NOUN[category]}</CardTitle>
        <CardDescription>
          {full ? (
            `That's all ${limit} — this list is full`
          ) : (
            <>
              {isProp ? "Prop" : "Game bet"} {nextPick} of {limit} will be{" "}
              <span className="text-brand">{visible ? "visible to everyone" : "admin-only preview"}</span>
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FeedNotice feed={feed} />

        {!chosen ? (
          <div className="max-h-[60vh] overflow-y-auto pr-1">
            <LinePicker
              games={games}
              show={{ lines: !isProp, props: isProp }}
              onPick={(option, game) => setChosen({ option, game })}
              isSelected={() => false}
            />
          </div>
        ) : (
          <form ref={formRef} onSubmit={handleSubmit} className="space-y-3">
            <input type="hidden" name="slateDate" value={date} />
            <input type="hidden" name="lineId" value={chosen.option.lineId} />
            <input type="hidden" name="expectedPrice" value={chosen.option.price} />

            <div className="rounded-lg border border-brand/30 bg-brand/5 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-fg">{chosen.option.label}</p>
                  <p className="mt-0.5 truncate text-xs text-fg-muted">
                    {chosen.game.awayTeam} vs {chosen.game.homeTeam}
                  </p>
                  <p className="mt-1 text-xs text-fg-subtle">
                    <span className="num font-semibold text-brand">{formatOdds(chosen.option.price)}</span> at{" "}
                    {chosen.option.bookTitle} — locked in when you add it
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setChosen(null)}
                  aria-label="Choose a different line"
                  className="grid size-8 shrink-0 place-items-center rounded-full text-fg-subtle hover:bg-surface-2 hover:text-fg"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="units">Units</Label>
                <Input id="units" name="units" type="number" step="0.01" min="0.1" max={MAX_UNITS[category]} defaultValue="1" className="mt-1.5 num" />
              </div>
              <div>
                <Label htmlFor="confidence">Conf %</Label>
                <Input id="confidence" name="confidence" type="number" min={0} max={100} placeholder="82" className="mt-1.5 num" />
              </div>
              <div>
                <Label htmlFor="evPct">EV %</Label>
                <Input id="evPct" name="evPct" type="number" step="0.1" placeholder="45.9" className="mt-1.5 num" />
              </div>
            </div>

            <div>
              <Label htmlFor="reasoning">Reasoning (optional)</Label>
              <Textarea id="reasoning" name="reasoning" rows={3} placeholder="Why this is the play — shown on the card." className="mt-1.5" />
            </div>

            <Button type="submit" className="w-full" disabled={pending || full}>
              {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}
              Add to board
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

/** Says when the feed is off, failing, or running low — instead of an empty list. */
export function FeedNotice({ feed }: { feed: FeedStatus }) {
  if (!feed.configured) {
    return (
      <p className="mb-3 rounded-lg border border-pending/30 bg-pending-dim px-3 py-2 text-xs text-pending">
        The odds feed is off — set ODDS_API_KEY in the server&apos;s .env to load games.
      </p>
    );
  }
  return (
    <>
      {feed.lastError && (
        <p className="mb-3 rounded-lg border border-miss/30 bg-miss-dim px-3 py-2 text-xs text-miss">
          Last feed refresh failed: {feed.lastError}
        </p>
      )}
      {feed.creditsRemaining !== null && feed.creditsRemaining < 100 && (
        <p className="mb-3 rounded-lg border border-pending/30 bg-pending-dim px-3 py-2 text-xs text-pending">
          Odds API credits running low: {feed.creditsRemaining} left this month.
        </p>
      )}
    </>
  );
}
