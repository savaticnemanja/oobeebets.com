import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";

/**
 * A tester's bets moved to their page in Users; old links land there. A route
 * rather than a page so the redirect is a real 307 — a page's redirect() runs
 * after admin/loading.tsx has streamed, and arrives as a client-side hop.
 * Non-admins get the same 404 as every other admin route.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const [auth, { userId }] = await Promise.all([getAuth(), params]);
  if (!auth?.isAdmin) return new NextResponse(null, { status: 404 });
  // Relative, so it can't pick up the internal host the proxy talks to.
  return new NextResponse(null, {
    status: 307,
    headers: { Location: `/admin/users/${encodeURIComponent(userId)}?tab=bets` },
  });
}
