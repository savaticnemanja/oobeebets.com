import type { Pick, Tier } from "@/db/schema";
import { FREE_VISIBLE_RANKS, TIERS } from "./tiers";

/**
 * How many ranks a viewer can see.
 *   null tier (logged out / no subscription) -> the Top Pick of the Day only.
 * Admins get everything; that is decided by the caller, not here.
 */
export function visibleRankLimit(tier: Tier | null): number {
  if (!tier) return FREE_VISIBLE_RANKS;
  return TIERS[tier].picksPerDay;
}

/**
 * A pick with its betting content stripped. This is what the client receives
 * for locked picks — the selection, price, book and reasoning are *absent from
 * the payload*, not hidden with CSS. Blurring in the UI is decoration over an
 * already-empty object.
 */
export type LockedPick = {
  locked: true;
  id: string;
  rank: number;
  sport: Pick["sport"];
  league: string;
  startsAt: Date;
  market: Pick["market"];
  /** The lowest tier that would unlock this pick — drives the upgrade CTA. */
  requiredTier: Tier;
};

export type UnlockedPick = Pick & { locked: false };

export type ViewPick = UnlockedPick | LockedPick;

function requiredTierForRank(rank: number): Tier {
  if (rank <= TIERS.base.picksPerDay) return "base";
  if (rank <= TIERS.pro.picksPerDay) return "pro";
  return "elite";
}

/**
 * The single gate. Every route that returns picks goes through this — there is
 * no other path from the picks table to a response body.
 */
export function gatePicks(
  picks: Pick[],
  viewerTier: Tier | null,
  isAdmin = false,
): ViewPick[] {
  const limit = isAdmin ? Number.POSITIVE_INFINITY : visibleRankLimit(viewerTier);

  return picks.map((p): ViewPick => {
    if (p.rank <= limit) return { ...p, locked: false };
    return {
      locked: true,
      id: p.id,
      rank: p.rank,
      sport: p.sport,
      league: p.league,
      startsAt: p.startsAt,
      market: p.market,
      requiredTier: requiredTierForRank(p.rank),
    };
  });
}

export function isLocked(p: ViewPick): p is LockedPick {
  return p.locked;
}
