import { NextResponse, type NextRequest } from "next/server";
import { appUrl } from "@/lib/site";
import { leaveWaitlist } from "@/lib/waitlist";

/**
 * The RFC 8058 one-click unsubscribe named in every waitlist email's
 * List-Unsubscribe header. Gmail and Yahoo POST here themselves when someone
 * uses their built-in "Unsubscribe"; a 2xx is the whole contract.
 */
export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) return new NextResponse("Missing token", { status: 400 });
  try {
    await leaveWaitlist(token);
  } catch (err) {
    console.error("[waitlist] one-click leave failed:", err);
    return new NextResponse("Failed", { status: 500 });
  }
  return new NextResponse(null, { status: 204 });
}

/** A client that follows the header as a link gets the page, which asks first — a GET never acts. */
export function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  return NextResponse.redirect(appUrl(`/waitlist/leave?token=${encodeURIComponent(token)}`));
}
