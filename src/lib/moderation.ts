import "server-only";
import { and, eq, or, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { userBlocks, userMutes } from "@/db/schema";

/**
 * Mute and block — who a viewer sees, and who may act on whom.
 *
 *   mute   you stop seeing them: their posts, reposts and parlays leave your
 *          feeds and Community, their likes and replies your notifications.
 *          They can't tell.
 *   block  the same, both ways — and no following, replying, quoting,
 *          liking, reposting or playing between you (canInteract).
 *
 * Feeds filter with visibleTo, actions check canInteract, so the rule lives
 * here once.
 */

/**
 * SQL: `author` is someone `viewerId` should see — not muted by them, and
 * no block either way. Signed out, everyone is visible.
 */
export function visibleTo(viewerId: string | null, author: AnyColumn | SQL): SQL {
  if (!viewerId) return sql`true`;
  return sql`(not exists (select 1 from ${userMutes} where ${userMutes.userId} = ${viewerId} and ${userMutes.mutedId} = ${author})
    and not exists (select 1 from ${userBlocks} where (${userBlocks.blockerId} = ${viewerId} and ${userBlocks.blockedId} = ${author})
      or (${userBlocks.blockedId} = ${viewerId} and ${userBlocks.blockerId} = ${author})))`;
}

/** SQL: no block either way between `viewerId` and `other` — for lists where a mute shouldn't hide (mention suggestions). */
export function notBlocked(viewerId: string, other: AnyColumn | SQL): SQL {
  return sql`not exists (select 1 from ${userBlocks} where (${userBlocks.blockerId} = ${viewerId} and ${userBlocks.blockedId} = ${other})
    or (${userBlocks.blockedId} = ${viewerId} and ${userBlocks.blockerId} = ${other}))`;
}

/** Whether `a` and `b` may follow, reply to, quote, like, repost or play each other: no block either way. */
export async function canInteract(a: string, b: string | null | undefined): Promise<boolean> {
  if (!b || a === b) return true;
  const [row] = await db
    .select({ one: sql<number>`1` })
    .from(userBlocks)
    .where(
      or(
        and(eq(userBlocks.blockerId, a), eq(userBlocks.blockedId, b)),
        and(eq(userBlocks.blockerId, b), eq(userBlocks.blockedId, a)),
      ),
    )
    .limit(1);
  return !row;
}

export const BLOCKED = "You can't do that — one of you has blocked the other.";

/** How the viewer stands with another account, for its profile. */
export async function relationship(
  viewerId: string,
  otherId: string,
): Promise<{ muted: boolean; blocked: boolean; blockedBy: boolean }> {
  const [row] = await db.execute<{ muted: boolean; blocked: boolean; blocked_by: boolean } & Record<string, unknown>>(sql`
    select
      exists (select 1 from ${userMutes} where ${userMutes.userId} = ${viewerId} and ${userMutes.mutedId} = ${otherId}) as muted,
      exists (select 1 from ${userBlocks} where ${userBlocks.blockerId} = ${viewerId} and ${userBlocks.blockedId} = ${otherId}) as blocked,
      exists (select 1 from ${userBlocks} where ${userBlocks.blockerId} = ${otherId} and ${userBlocks.blockedId} = ${viewerId}) as blocked_by
  `);
  return { muted: Boolean(row?.muted), blocked: Boolean(row?.blocked), blockedBy: Boolean(row?.blocked_by) };
}
