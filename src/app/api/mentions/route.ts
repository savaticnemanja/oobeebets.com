import { and, asc, desc, ilike, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { userFollows, users } from "@/db/schema";
import { getAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Who "@an" could mean, for the composer's suggestions (mention-suggest.tsx):
 * handles and names starting with it, people you follow first. A bare "@"
 * lists people you follow. A GET rather than a server action so the
 * composer can drop a request the next keystroke made stale.
 */
export async function GET(req: Request) {
  const auth = await getAuth();
  if (!auth) return Response.json({ users: [] }, { status: 401 });
  const q = (new URL(req.url).searchParams.get("q") ?? "").toLowerCase();
  if (!/^[a-z0-9_]{0,20}$/.test(q)) return Response.json({ users: [] });

  // `_` is a LIKE wildcard, and handles are full of them.
  const like = q.replace(/_/g, "\\_");
  const follows = sql<boolean>`exists(select 1 from ${userFollows} where ${userFollows.followerId} = ${auth.user.id} and ${userFollows.followeeId} = ${users.id})`;
  const rows = await db
    .select({ id: users.id, username: users.username, displayName: users.displayName, role: users.role })
    .from(users)
    .where(
      and(
        ne(users.id, auth.user.id),
        q
          ? or(ilike(users.username, `${like}%`), ilike(users.displayName, `${like}%`), ilike(users.displayName, `% ${like}%`))
          : follows,
      ),
    )
    .orderBy(desc(follows), asc(users.username))
    .limit(6);
  return Response.json({ users: rows }, { headers: { "Cache-Control": "no-store" } });
}
