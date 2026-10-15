import { NextResponse } from "next/server";
import { siteNoIndex } from "@/lib/indexing";

/**
 * Marks every response noindex on a deployment that sets SITE_NOINDEX=1 —
 * beta, which serves production's copy from a different hostname. Indexed,
 * it would compete with the real site for its own search results. Elsewhere
 * this hands every request straight back.
 *
 * Belt and braces with robots.txt: the header travels with every response,
 * redirects included, so a crawler that never fetched robots.txt still sees it.
 */

export const config = {
  matcher: ["/((?!_next/static|_next/image|icons/|favicon.ico|icon.svg|apple-icon.png|sw.js).*)"],
};

export function middleware() {
  const response = NextResponse.next();
  if (siteNoIndex()) response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}
