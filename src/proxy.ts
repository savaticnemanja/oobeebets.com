import { NextResponse, type NextRequest } from "next/server";
import { PRELAUNCH, PRELAUNCH_PATH, isAllowedDuringPrelaunch } from "@/lib/prelaunch";

export function proxy(request: NextRequest) {
  if (!PRELAUNCH) return NextResponse.next();

  const { pathname } = request.nextUrl;

  // A rewrite rather than a redirect: the signup page is what the site *is*
  // right now, so it should be served at `/` and not at a placeholder URL that
  // gets shared, bookmarked and indexed and then has to be unwound at launch.
  if (pathname === "/") {
    return NextResponse.rewrite(new URL(PRELAUNCH_PATH, request.url));
  }

  if (isAllowedDuringPrelaunch(pathname)) return NextResponse.next();

  // Everything else is a redirect, not a rewrite. Serving the signup page with
  // a 200 at /picks and /pricing would put a dozen duplicates of it in the
  // index under the URLs we most want ranking after launch.
  const home = request.nextUrl.clone();
  home.pathname = "/";
  home.search = "";
  // 307, not 308: these routes come back at launch, and a permanent redirect
  // is cached by browsers long after the flag is lifted.
  return NextResponse.redirect(home, 307);
}

export const config = {
  matcher: [
    /**
     * Everything except the static and metadata routes. Those are served the
     * same before and after launch, and running the proxy on them would only
     * add a hop per asset.
     */
    "/((?!_next/static|_next/image|favicon\\.ico|icons/|sw\\.js|manifest\\.webmanifest|robots\\.txt|sitemap\\.xml|opengraph-image|apple-icon|icon\\.svg).*)",
  ],
};
