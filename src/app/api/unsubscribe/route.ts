import { NextResponse, type NextRequest } from "next/server";
import { unsubscribeById } from "@/lib/newsletter";
import { appUrl } from "@/lib/site";

/**
 * The RFC 8058 one-click unsubscribe endpoint named in every message's
 * List-Unsubscribe header.
 *
 * This is not the page a person visits — that is /unsubscribe. Gmail and Yahoo
 * POST here themselves when someone uses the unsubscribe control built into
 * the mail client, with no browser involved and nothing to render.
 */

export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) return new NextResponse("Missing token", { status: 400 });

  try {
    await unsubscribeById(token);
  } catch (err) {
    console.error("[newsletter] one-click unsubscribe failed:", err);
    return new NextResponse("Unsubscribe failed", { status: 500 });
  }

  // A 2xx is the whole contract; the provider shows its own confirmation.
  return new NextResponse(null, { status: 204 });
}

/**
 * Some clients follow the header as an ordinary link instead of posting to it.
 * Hand those to the real page rather than acting on a GET, so that a link
 * prefetcher cannot unsubscribe somebody by scanning their mail.
 */
export function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  return NextResponse.redirect(
    appUrl(`/unsubscribe?token=${encodeURIComponent(token)}`),
  );
}
