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
import { leagueValues, marketValues } from "@/lib/validation";
import { PICKS_PER_SLATE, VISIBLE_PICKS } from "@/lib/board";

const SIDES = ["Over", "Under"] as const;

/**
 * Publishing picks is a daily chore, so this form is built for speed: it
 * keeps league/market between submissions and returns focus to the first
 * field. Rank is never typed in — a new pick always lands on the next free
 * slot; reordering happens by dragging rows in the list below.
 */
export function PickComposer({
  date,
  pickCount,
  disabled,
}: {
  date: string;
  pickCount: number;
  disabled: boolean;
}) {
  const [state, action, pending] = useActionState(createPickAction, null);
  const formRef = React.useRef<HTMLFormElement>(null);
  const firstFieldRef = React.useRef<HTMLInputElement>(null);

  const [league, setLeague] = React.useState<(typeof leagueValues)[number]>("MLB");
  const [market, setMarket] = React.useState<string>("total");
  const [side, setSide] = React.useState<(typeof SIDES)[number]>("Over");
  const [line, setLine] = React.useState("");

  // Render-phase reset (not inside the effect below) so clearing `line` on a
  // successful submit doesn't cause an extra, avoidable render pass.
  const [lastHandledState, setLastHandledState] = React.useState(state);
  if (state !== lastHandledState) {
    setLastHandledState(state);
    if (state?.ok) setLine("");
  }

  // Submitting through `onSubmit` rather than `action={action}` on purpose:
  // React resets an uncontrolled form once its action settles, which wiped
  // everything the admin had typed whenever the submit came back invalid.
  // Driving the action by hand keeps the fields, and the success path below
  // clears them explicitly.
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    React.startTransition(() => action(formData));
  }

  React.useEffect(() => {
    if (state?.ok) {
      toast.success(state.message ?? "Pick added");
      // Clear only the game-specific fields; league/market persist because
      // consecutive picks usually share them.
      const form = formRef.current;
      if (form) {
        for (const name of ["awayTeam", "homeTeam", "selection", "price", "confidence", "evPct", "reasoning"]) {
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
  const nextPick = pickCount + 1;
  const visible = nextPick <= VISIBLE_PICKS;
  const isTotal = market === "total";
  const ouSelection = line.trim() ? `${side} ${line.trim()}` : "";

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
          {pickCount >= PICKS_PER_SLATE ? (
            "Slate is full"
          ) : (
            <>
              Pick {nextPick} of {PICKS_PER_SLATE} will be{" "}
              <span className="text-brand">{visible ? "visible to everyone" : "admin-only preview"}</span>
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-3">
          <input type="hidden" name="slateDate" value={date} />
          <input type="hidden" name="market" value={market} />
          {isTotal && <input type="hidden" name="selection" value={ouSelection} />}

          <div>
            <Label htmlFor="league-trigger">League</Label>
            <Select value={league} onValueChange={(v) => setLeague(v as typeof league)}>
              <SelectTrigger id="league-trigger" className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {leagueValues.map((l) => (
                  <SelectItem key={l} value={l}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input type="hidden" name="league" value={league} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="awayTeam">Away team</Label>
              <Input
                ref={firstFieldRef}
                id="awayTeam"
                name="awayTeam"
                required
                placeholder="Las Vegas Aces"
                className="mt-1.5"
                aria-invalid={Boolean(fe?.awayTeam)}
              />
              {fe?.awayTeam && <p className="mt-1 text-xs text-miss">{fe.awayTeam[0]}</p>}
            </div>
            <div>
              <Label htmlFor="homeTeam">Home team</Label>
              <Input
                id="homeTeam"
                name="homeTeam"
                required
                placeholder="New York Liberty"
                className="mt-1.5"
                aria-invalid={Boolean(fe?.homeTeam)}
              />
              {fe?.homeTeam && <p className="mt-1 text-xs text-miss">{fe.homeTeam[0]}</p>}
            </div>
          </div>

          <div>
            <Label htmlFor="startsAt">Kick-off (Eastern time)</Label>
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

          {isTotal ? (
            <div>
              <Label>Selection</Label>
              <div className="mt-1.5 grid grid-cols-2 gap-3">
                <Select value={side} onValueChange={(v) => setSide(v as typeof side)}>
                  <SelectTrigger aria-label="Over or under">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SIDES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  step="0.5"
                  placeholder="217.5"
                  aria-label="Line"
                  value={line}
                  onChange={(e) => setLine(e.target.value)}
                  className="num"
                  required
                />
              </div>
              {fe?.selection && <p className="mt-1 text-xs text-miss">{fe.selection[0]}</p>}
            </div>
          ) : (
            <div>
              <Label htmlFor="selection">Selection</Label>
              <Input
                id="selection"
                name="selection"
                required
                placeholder="Dundee United +1.5"
                className="mt-1.5"
                aria-invalid={Boolean(fe?.selection)}
              />
              {fe?.selection && <p className="mt-1 text-xs text-miss">{fe.selection[0]}</p>}
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="units">Units</Label>
              <Input
                id="units"
                name="units"
                type="number"
                step="0.25"
                min="0.25"
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
            <Label htmlFor="reasoning">Reasoning (optional)</Label>
            <Textarea
              id="reasoning"
              name="reasoning"
              rows={3}
              placeholder="Why this is the play — shown on the card."
              className="mt-1.5"
            />
          </div>

          <Button type="submit" className="w-full" disabled={pending || pickCount >= PICKS_PER_SLATE}>
            {pending ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <Plus aria-hidden="true" />
            )}
            Add pick
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
