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
import { leagueValues, marketValues, PROP_STATS } from "@/lib/validation";
import {
  CATEGORY_NOUN,
  PICKS_PER_SLATE,
  VISIBLE_PICKS,
  type PickCategory,
} from "@/lib/board";

const SIDES = ["Over", "Under"] as const;

/**
 * Publishing picks is a daily chore, so this form is built for speed: it
 * keeps league/market between submissions and returns focus to the first
 * field. Rank is never typed in — a new pick always lands on the next free
 * slot *in this category*; reordering happens by dragging rows in the list
 * below.
 *
 * One component serves both tabs rather than two near-identical forms. The
 * shared two thirds — game, kick-off, price, stake, edge — are genuinely the
 * same fields; only how the selection is described differs, so that is the
 * only part that branches.
 */
export function PickComposer({
  date,
  category,
  pickCount,
  disabled,
}: {
  date: string;
  category: PickCategory;
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
  const [player, setPlayer] = React.useState("");
  const [stat, setStat] = React.useState("");

  const isProp = category === "prop";
  const limit = PICKS_PER_SLATE[category];
  const freeLimit = VISIBLE_PICKS[category];

  // Render-phase reset (not inside the effect below) so clearing fields on a
  // successful submit doesn't cause an extra, avoidable render pass.
  const [lastHandledState, setLastHandledState] = React.useState(state);
  if (state !== lastHandledState) {
    setLastHandledState(state);
    if (state?.ok) {
      setPlayer("");
      // On the props tab the line usually carries over (0.5 for hits, walks
      // and RBIs alike), so only the player is cleared. On the game tab the
      // line belongs to the game that just went in.
      if (!isProp) setLine("");
    }
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
      const form = formRef.current;
      if (form) {
        // A day's props are mostly drawn from one or two games, so the teams
        // and the kick-off stay put on that tab and only the wager clears. On
        // the game tab every pick is a different fixture, so they go too.
        const clear = isProp
          ? ["price", "book", "confidence", "evPct", "reasoning"]
          : ["awayTeam", "homeTeam", "selection", "price", "book", "confidence", "evPct", "reasoning"];
        for (const name of clear) {
          const el = form.elements.namedItem(name) as HTMLInputElement | null;
          if (el) el.value = "";
        }
      }
      firstFieldRef.current?.focus();
    } else if (state && !state.ok) {
      toast.error(state.error);
    }
  }, [state, isProp]);

  const fe = state && !state.ok ? state.fieldErrors : undefined;
  const nextPick = pickCount + 1;
  const visible = nextPick <= freeLimit;
  const isTotal = market === "total";

  // What actually gets stored as `selection`. Props compose it from four
  // fields so every prop on the board reads the same way; totals compose it
  // from two. Both are built here rather than typed, which is what keeps
  // "Martin Perez UNDER 4.5 Strikeouts" from arriving in six different shapes.
  const propSelection =
    player.trim() && line.trim() && stat.trim()
      ? `${player.trim()} ${side.toUpperCase()} ${line.trim()} ${stat.trim()}`
      : "";
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
        <CardTitle>Add a {CATEGORY_NOUN[category]}</CardTitle>
        <CardDescription>
          {pickCount >= limit ? (
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
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-3">
          <input type="hidden" name="slateDate" value={date} />
          <input type="hidden" name="category" value={category} />
          {/* Market is forced to "prop" on this tab — the server derives it
              too, so the hidden field is a convenience, not the authority. */}
          <input type="hidden" name="market" value={isProp ? "prop" : market} />
          {isProp && <input type="hidden" name="selection" value={propSelection} />}
          {!isProp && isTotal && <input type="hidden" name="selection" value={ouSelection} />}

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

          {/* ------------------------------------------------ the player prop */}
          {isProp && (
            <div>
              <Label htmlFor="player">Player</Label>
              <Input
                ref={firstFieldRef}
                id="player"
                value={player}
                onChange={(e) => setPlayer(e.target.value)}
                required
                placeholder="Martin Perez"
                className="mt-1.5"
                aria-invalid={Boolean(fe?.selection)}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="awayTeam">Away team</Label>
              <Input
                ref={isProp ? undefined : firstFieldRef}
                id="awayTeam"
                name="awayTeam"
                required
                placeholder="Colorado Rockies"
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
                placeholder="Atlanta Braves"
                className="mt-1.5"
                aria-invalid={Boolean(fe?.homeTeam)}
              />
              {fe?.homeTeam && <p className="mt-1 text-xs text-miss">{fe.homeTeam[0]}</p>}
            </div>
          </div>

          <div>
            <Label htmlFor="startsAt">
              {isProp ? "First pitch / kick-off (Eastern time)" : "Kick-off (Eastern time)"}
            </Label>
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

          {isProp ? (
            <>
              <div>
                <Label htmlFor="stat">Stat</Label>
                <Input
                  id="stat"
                  list="prop-stats"
                  value={stat}
                  onChange={(e) => setStat(e.target.value)}
                  required
                  placeholder="Strikeouts"
                  className="mt-1.5"
                />
                {/* Suggestions, not a closed list — the long tail is typable. */}
                <datalist id="prop-stats">
                  {PROP_STATS[league].map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <Label>Line</Label>
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
                      placeholder="4.5"
                      aria-label="Line"
                      value={line}
                      onChange={(e) => setLine(e.target.value)}
                      className="num"
                      required
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="price">Price</Label>
                  <Input
                    id="price"
                    name="price"
                    type="number"
                    required
                    placeholder="-129"
                    className="mt-1.5 num"
                    aria-invalid={Boolean(fe?.price)}
                  />
                  {fe?.price && <p className="mt-1 text-xs text-miss">{fe.price[0]}</p>}
                </div>
              </div>

              {/* The admin should see the string that will be published, not
                  discover it on the board afterwards. */}
              <p className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-fg-muted">
                {propSelection || (
                  <span className="text-fg-subtle">
                    Player, line and stat compose the selection.
                  </span>
                )}
              </p>
              {fe?.selection && <p className="text-xs text-miss">{fe.selection[0]}</p>}
            </>
          ) : (
            <>
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
            </>
          )}

          <div>
            <Label htmlFor="book">Book (optional)</Label>
            <Input
              id="book"
              name="book"
              placeholder="FD/DK/BetRivers"
              className="mt-1.5"
            />
          </div>

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
                placeholder="82"
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
                placeholder="45.9"
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

          <Button type="submit" className="w-full" disabled={pending || pickCount >= limit}>
            {pending ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <Plus aria-hidden="true" />
            )}
            Add {CATEGORY_NOUN[category]}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
