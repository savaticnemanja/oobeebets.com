import { getSeatUsage, getSettings } from "@/lib/settings";
import { SettingsForm } from "@/components/admin/settings-form";
import { StatTile } from "@/components/stat-tile";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Settings" };

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const [settings, seats] = await Promise.all([getSettings(), getSeatUsage()]);

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-1.5 text-sm text-fg-muted">
        Prices and the seat cap take effect for new signups only. Existing subscribers
        keep the price frozen on their subscription.
      </p>

      <dl className="mt-6 grid grid-cols-3 gap-3">
        <StatTile label="Seats taken" value={seats.taken} tone="brand" />
        <StatTile label="Cap" value={seats.cap} />
        <StatTile
          label="Left"
          value={seats.left}
          tone={seats.left === 0 ? "miss" : "hit"}
        />
      </dl>

      <div className="mt-8">
        <SettingsForm settings={settings} />
      </div>
    </div>
  );
}
