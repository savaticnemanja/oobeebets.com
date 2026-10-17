"use server";

import { z } from "zod";
import { getAuth, rateLimit } from "@/lib/auth";
import { getGameProps } from "@/lib/odds/board";
import { ensureGameProps } from "@/lib/odds/sync";
import type { PropGroup } from "@/lib/odds/markets";

/**
 * One game's player props, for a picker that just opened them. Fetched from
 * the provider only when the stored copy is stale (ensureGameProps), so
 * opening the same game twice, or by two people, costs one fetch.
 *
 * Each fetch spends paid credits, and this is open to every tester, so one
 * person gets a few dozen opens an hour; past that they see what's stored.
 */
export async function loadGamePropsAction(gameId: string): Promise<PropGroup[]> {
  const auth = await getAuth();
  if (!auth) return [];
  if (!z.string().min(1).max(100).regex(/^[\w-]+$/).safeParse(gameId).success) return [];
  if (await rateLimit("props:user", auth.user.id, 40, 60 * 60 * 1000)) await ensureGameProps(gameId);
  return getGameProps(gameId);
}
