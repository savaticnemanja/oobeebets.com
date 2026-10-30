import "server-only";
import { cache } from "react";
import { and, gt, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { passes } from "@/db/schema";
import type { AuthContext } from "@/lib/auth";
import { VISIBLE_PICKS } from "@/lib/board";
import { ACCESS, coveredUntil, type Access, type AccessRule } from "@/lib/pass";
import { billingEnabled } from "./stripe";

export interface ViewerAccess {
  /** The viewer's access; null where passes don't apply (admins, billing off). */
  access: Access | null;
  rule: AccessRule;
  /** When the passes they hold run out — back-to-back passes count as one. */
  passEndsAt: Date | null;
}

/** What every viewer gets with billing off: the whole board, free. */
const OPEN_RULE: AccessRule = { picks: VISIBLE_PICKS, parlays: true };

/**
 * What a viewer may see. Admins see everything (the board's own isAdmin
 * checks cover drafts); with billing off everyone sees the whole board; with
 * it on, the whole board while a pass covers now, or the free board.
 */
export const viewerAccess = cache(async (auth: AuthContext | null): Promise<ViewerAccess> => {
  if (auth?.isAdmin) return { access: null, rule: ACCESS.pass, passEndsAt: null };
  if (!billingEnabled()) return { access: null, rule: OPEN_RULE, passEndsAt: null };
  if (!auth) return { access: "free", rule: ACCESS.free, passEndsAt: null };

  const passEndsAt = (await passesCovering([auth.user.id])).get(auth.user.id) ?? null;
  return passEndsAt
    ? { access: "pass", rule: ACCESS.pass, passEndsAt }
    : { access: "free", rule: ACCESS.free, passEndsAt: null };
});

/** For each of these accounts that holds a pass right now: when it runs out. */
export async function passesCovering(userIds: string[], at = new Date()): Promise<Map<string, Date>> {
  if (userIds.length === 0) return new Map();
  const rows = await db
    .select({ userId: passes.userId, startsAt: passes.startsAt, endsAt: passes.endsAt })
    .from(passes)
    .where(and(inArray(passes.userId, userIds), isNull(passes.refundedAt), gt(passes.endsAt, at)));

  const byUser = Map.groupBy(rows, (r) => r.userId);
  const covered = new Map<string, Date>();
  for (const [userId, held] of byUser) {
    const until = coveredUntil(held, at);
    if (until) covered.set(userId, until);
  }
  return covered;
}

