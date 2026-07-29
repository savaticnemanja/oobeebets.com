import "server-only";
import { cache } from "react";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { settings, subscriptions } from "@/db/schema";
import { DEFAULT_SEAT_CAP, TIERS } from "./tiers";
import type { Tier } from "@/db/schema";

export interface AppSettings {
  /** FR-F6: the entire free-trial abuse mitigation is this one switch. */
  trialsEnabled: boolean;
  seatCap: number;
  /** Live prices in cents. Raised monthly; existing subs are unaffected. */
  pricing: Record<Tier, number>;
  /** Shown on /pricing to create the deadline. ISO date or null. */
  nextPriceRiseAt: string | null;
}

export const DEFAULT_SETTINGS: AppSettings = {
  trialsEnabled: true,
  seatCap: DEFAULT_SEAT_CAP,
  pricing: {
    base: TIERS.base.priceCents,
    pro: TIERS.pro.priceCents,
    elite: TIERS.elite.priceCents,
  },
  nextPriceRiseAt: null,
};

export const getSettings = cache(async (): Promise<AppSettings> => {
  const rows = await db.select().from(settings);
  const map = new Map(rows.map((r) => [r.key, r.value]));

  return {
    trialsEnabled:
      (map.get("trialsEnabled") as boolean | undefined) ?? DEFAULT_SETTINGS.trialsEnabled,
    seatCap: (map.get("seatCap") as number | undefined) ?? DEFAULT_SETTINGS.seatCap,
    pricing: {
      ...DEFAULT_SETTINGS.pricing,
      ...((map.get("pricing") as Partial<Record<Tier, number>> | undefined) ?? {}),
    },
    nextPriceRiseAt:
      (map.get("nextPriceRiseAt") as string | null | undefined) ??
      DEFAULT_SETTINGS.nextPriceRiseAt,
  };
});

export async function setSetting<K extends keyof AppSettings>(
  key: K,
  value: AppSettings[K],
  updatedBy?: string,
): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value: value as never, updatedBy: updatedBy ?? null })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: value as never, updatedAt: new Date(), updatedBy: updatedBy ?? null },
    });
}

/** Live seats taken. `trialing` counts — a trial holds a seat (FR-F5). */
export async function getSeatUsage(): Promise<{ taken: number; cap: number; left: number }> {
  const settingsRow = await getSettings();
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(subscriptions)
    .where(sql`${subscriptions.status} in ('trialing','active','past_due')`);

  const taken = row?.n ?? 0;
  return {
    taken,
    cap: settingsRow.seatCap,
    left: Math.max(0, settingsRow.seatCap - taken),
  };
}

export async function seatsAvailable(): Promise<boolean> {
  const { left } = await getSeatUsage();
  return left > 0;
}

export async function getSettingRow(key: string) {
  const [row] = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  return row ?? null;
}
