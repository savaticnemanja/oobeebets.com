"use server";

import { z } from "zod";
import { getAuth } from "@/lib/auth";
import { getGameProps } from "@/lib/odds/board";
import { ensureGameProps } from "@/lib/odds/sync";
import type { PropGroup } from "@/lib/odds/markets";

/**
 * One game's player props, for a picker that just opened them. Fetched from
 * the provider only when the stored copy is stale (ensureGameProps), so
 * opening the same game twice, or by two people, costs one fetch.
 */
export async function loadGamePropsAction(gameId: string): Promise<PropGroup[]> {
  const auth = await getAuth();
  if (!auth) return [];
  if (!z.string().min(1).max(100).regex(/^[\w-]+$/).safeParse(gameId).success) return [];
  await ensureGameProps(gameId);
  return getGameProps(gameId);
}
