import { getAuth } from "@/lib/auth";
import { unreadCount } from "@/lib/notifications";

export const dynamic = "force-dynamic";

/**
 * The nav badge's count, polled by components/app-shell/unread.tsx. A plain
 * GET rather than a server action: actions queue behind (and ahead of) the
 * router's navigations, and a badge has no business slowing a tap down.
 */
export async function GET() {
  const auth = await getAuth();
  if (!auth) return Response.json({ unread: 0 }, { status: 401 });
  return Response.json({ unread: await unreadCount(auth.user.id) }, { headers: { "Cache-Control": "no-store" } });
}
