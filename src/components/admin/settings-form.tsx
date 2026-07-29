"use client";

import { useActionState, useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/misc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { updateSettingsAction } from "@/app/actions/admin";
import type { AppSettings } from "@/lib/settings";
import { TRIAL_DAYS } from "@/lib/tiers";

export function SettingsForm({ settings }: { settings: AppSettings }) {
  const [state, action, pending] = useActionState(updateSettingsAction, null);
  const [trials, setTrials] = useState(settings.trialsEnabled);

  useEffect(() => {
    if (state?.ok) toast.success(state.message ?? "Saved");
    else if (state && !state.ok) toast.error(state.error);
  }, [state]);

  return (
    <form action={action} className="space-y-4">
      {/* -------------------------------------------------------- trials */}
      <Card>
        <CardHeader>
          <CardTitle>Free trial</CardTitle>
          <CardDescription>
            The kill switch. Turning this off stops all new trials immediately; trials
            already running finish normally.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface p-4">
            <div>
              <Label htmlFor="trialsEnabled" className="text-sm normal-case tracking-normal text-fg">
                {TRIAL_DAYS}-day free trial
              </Label>
              <p className="mt-1 text-xs text-fg-muted">
                {trials
                  ? "New members can start a trial. One per account, ever."
                  : "Trials are off. Everyone pays from day one."}
              </p>
            </div>
            <Switch
              id="trialsEnabled"
              name="trialsEnabled"
              checked={trials}
              onCheckedChange={setTrials}
            />
          </div>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------- pricing */}
      <Card>
        <CardHeader>
          <CardTitle>Pricing</CardTitle>
          <CardDescription>
            Whole dollars per month. Raising these never touches an existing
            subscriber&apos;s price — that&apos;s the grandfathering promise.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="basePrice">Base $</Label>
              <Input
                id="basePrice"
                name="basePrice"
                type="number"
                min={0}
                required
                defaultValue={Math.round(settings.pricing.base / 100)}
                className="mt-1.5 num"
              />
            </div>
            <div>
              <Label htmlFor="proPrice">Pro $</Label>
              <Input
                id="proPrice"
                name="proPrice"
                type="number"
                min={0}
                required
                defaultValue={Math.round(settings.pricing.pro / 100)}
                className="mt-1.5 num"
              />
            </div>
            <div>
              <Label htmlFor="elitePrice">Elite $</Label>
              <Input
                id="elitePrice"
                name="elitePrice"
                type="number"
                min={0}
                required
                defaultValue={Math.round(settings.pricing.elite / 100)}
                className="mt-1.5 num"
              />
            </div>
          </div>

          <div className="mt-4">
            <Label htmlFor="nextPriceRiseAt">Next price rise (shown on pricing page)</Label>
            <Input
              id="nextPriceRiseAt"
              name="nextPriceRiseAt"
              type="date"
              defaultValue={settings.nextPriceRiseAt ?? ""}
              className="mt-1.5 num w-48"
            />
            <p className="mt-1.5 text-xs text-fg-subtle">
              Display only — it creates the deadline. It does not change prices by itself.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ---------------------------------------------------------- cap */}
      <Card>
        <CardHeader>
          <CardTitle>Capacity</CardTitle>
          <CardDescription>
            When live subscriptions reach the cap, checkout closes and the pricing page
            becomes a waitlist.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div>
            <Label htmlFor="seatCap">Seat cap</Label>
            <Input
              id="seatCap"
              name="seatCap"
              type="number"
              min={1}
              required
              defaultValue={settings.seatCap}
              className="mt-1.5 num w-40"
            />
          </div>
        </CardContent>
      </Card>

      <Button type="submit" disabled={pending}>
        {pending ? (
          <Loader2 className="animate-spin" aria-hidden="true" />
        ) : (
          <Save aria-hidden="true" />
        )}
        Save settings
      </Button>
    </form>
  );
}
