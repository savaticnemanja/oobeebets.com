import { NextResponse, type NextRequest } from "next/server";
import { unsubscribeByToken } from "@/lib/waitlist";
import { appUrl } from "@/lib/site";

/**
 * One-click unsubscribe (RFC 8058) for every email we send: the mailbox POSTs
 * here from the List-Unsubscribe header. The token is a waitlist leave token
 * or, in the old launch-list emails, a Resend contact id — lib/waitlist.ts
 * unsubscribeByToken takes either. 204 even for a token that matches no one:
 * that outcome is the one they asked for.
 *
 * A GET is a person following the link, so it goes to the page and its button
 * — never unsubscribed on load, which link scanners would trigger.
 */
export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) return new NextResponse("Missing token", { status: 400 });
  try {
    await unsubscribeByToken(token);
  } catch (err) {
    console.error("[waitlist] one-click unsubscribe failed:", err);
    // A 5xx makes the mailbox provider retry.
    return new NextResponse("Unsubscribe failed", { status: 500 });
  }
  return new NextResponse(null, { status: 204 });
}

export function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  return NextResponse.redirect(appUrl(`/unsubscribe?token=${encodeURIComponent(token)}`));
}
