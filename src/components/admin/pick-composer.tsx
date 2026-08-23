"use client";

import * as React from "react";
import { useActionState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { createPickAction } from "@/app/actions/admin";
import { marketValues, sportValues } from "@/lib/validation";
import { PICKS_PER_SLATE, VISIBLE_PICKS } from "@/lib/board";

/**
 * Publishing 30 picks is a daily chore, so this form is built for speed:
 * it keeps its sport/league/book values between submissions, auto-advances the
 * rank, and returns focus to the first field. One pick should take seconds.
 */
export function PickComposer({
  date,
  usedRanks,
  disabled,
}: {
  date: string;
  usedRanks: number[];
  disabled: boolean;
}) {
  const [state, action, pending] = useActionState(createPickAction, null);
  const formRef = React.useRef<HTMLFormElement>(null);
  const firstFieldRef = React.useRef<HTMLInputElement>(null);

  const nextRank = React.useMemo(() => {
    for (let i = 1; i <= PICKS_PER_SLATE; i++) if (!usedRanks.includes(i)) return i;
    return PICKS_PER_SLATE;
  }, [usedRanks]);

  const [rank, setRank] = React.useState(nextRank);
  const [sport, setSport] = React.useState<string>("soccer");
  const [market, setMarket] = React.useState<string>("total");

  // Auto-advance to the next free rank after a save, while still letting the
  // admin type a rank by hand. This is React's documented "adjust state when a
  // prop changes" pattern — a render-phase set, not an effect, so there is no
  // extra commit and no flash of the stale rank.
  const [lastAutoRank, setLastAutoRank] = React.useState(nextRank);
  if (lastAutoRank !== nextRank) {
    setLastAutoRank(nextRank);
    setRank(nextRank);
  }

  React.useEffect(() => {
    if (state?.ok) {
      toast.success(state.message ?? "Pick added");
      // Clear only the game-specific fields; sport/league/book persist because
      // consecutive picks usually share them.
      const form = formRef.current;
      if (form) {
        for (const name of ["event", "selection", "price", "confidence", "evPct", "reasoning"]) {
          const el = form.elements.namedItem(name) as HTMLInputElement | null;
          if (el) el.value = "";
        }
      }
      firstFieldRef.current?.focus();
    } else if (state && !state.ok) {
      toast.error(state.error);
    }
  }, [state]);

  const fe = state && !state.ok ? state.fieldErrors : undefined;
  const visible = rank <= VISIBLE_PICKS;

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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add a pick</CardTitle>
        <CardDescription>
          Rank {rank} is{" "}
          <span className="text-brand">{visible ? "visible to everyone" : "admin-only preview"}</span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={formRef} action={action} className="space-y-3">
          <input type="hidden" name="slateDate" value={date} />
          <input type="hidden" name="sport" value={sport} />
          <input type="hidden" name="market" value={market} />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="rank">Rank</Label>
              <Input
                id="rank"
                name="rank"
                type="number"
                min={1}
                max={PICKS_PER_SLATE}
                required
                value={rank}
                onChange={(e) => setRank(Number(e.target.value))}
                className="mt-1.5"
                aria-invalid={Boolean(fe?.rank)}
              />
              {fe?.rank && <p className="mt-1 text-xs text-miss">{fe.rank[0]}</p>}
            </div>
            <div>
              <Label htmlFor="sport-trigger">Sport</Label>
              <Select value={sport} onValueChange={setSport}>
                <SelectTrigger id="sport-trigger" className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sportValues.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="league">League</Label>
            <Input
              id="league"
              name="league"
              required
              placeholder="MLB"
              className="mt-1.5"
              aria-invalid={Boolean(fe?.league)}
            />
          </div>

          <div>
            <Label htmlFor="event">Game</Label>
            <Input
              ref={firstFieldRef}
              id="event"
              name="event"
              required
              placeholder="New York Liberty vs Las Vegas Aces"
              className="mt-1.5"
              aria-invalid={Boolean(fe?.event)}
            />
            {fe?.event && <p className="mt-1 text-xs text-miss">{fe.event[0]}</p>}
          </div>

          <div>
            <Label htmlFor="startsAt">Kick-off (local time)</Label>
            <Input
              id="startsAt"
              name="startsAt"
              type="datetime-local"
              required
              className="mt-1.5"
              aria-invalid={Boolean(fe?.startsAt)}
            />
            {fe?.startsAt && <p className="mt-1 text-xs text-miss">{fe.startsAt[0]}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="market-trigger">Market</Label>
              <Select value={market} onValueChange={setMarket}>
                <SelectTrigger id="market-trigger" className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {marketValues.map((m) => (
                    <SelectItem key={m} value={m} className="capitalize">
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="price">Price (US odds)</Label>
              <Input
                id="price"
                name="price"
                type="number"
                required
                placeholder="-118"
                className="mt-1.5 num"
                aria-invalid={Boolean(fe?.price)}
              />
              {fe?.price && <p className="mt-1 text-xs text-miss">{fe.price[0]}</p>}
            </div>
          </div>

          <div>
            <Label htmlFor="selection">Selection</Label>
            <Input
              id="selection"
              name="selection"
              required
              placeholder="Over 177.5"
              className="mt-1.5"
              aria-invalid={Boolean(fe?.selection)}
            />
            {fe?.selection && <p className="mt-1 text-xs text-miss">{fe.selection[0]}</p>}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="units">Units</Label>
              <Input
                id="units"
                name="units"
                type="number"
                step="0.25"
                min="0.1"
                max="10"
                defaultValue="1"
                className="mt-1.5 num"
              />
            </div>
            <div>
              <Label htmlFor="confidence">Conf %</Label>
              <Input
                id="confidence"
                name="confidence"
                type="number"
                min={0}
                max={100}
                placeholder="64"
                className="mt-1.5 num"
              />
            </div>
            <div>
              <Label htmlFor="evPct">EV %</Label>
              <Input
                id="evPct"
                name="evPct"
                type="number"
                step="0.1"
                placeholder="23"
                className="mt-1.5 num"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="book">Book (optional)</Label>
            <Input id="book" name="book" placeholder="DraftKings" className="mt-1.5" />
          </div>

          <div>
            <Label htmlFor="reasoning">Reasoning (optional)</Label>
            <Textarea
              id="reasoning"
              name="reasoning"
              rows={3}
              placeholder="Why this is the play — shown on the card."
              className="mt-1.5"
            />
          </div>

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <Plus aria-hidden="true" />
            )}
            Add pick {rank}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
