import { NextResponse, type NextRequest } from "next/server";
import {
  BETA_GATE_COOKIE,
  BETA_GATE_PATH,
  betaGatePassword,
  safeNextPath,
  verifyBetaGateToken,
} from "@/lib/beta-gate";
import { siteNoIndex } from "@/lib/indexing";

/**
 * Holds the beta deployment shut until a visitor knows the password.
 *
 * Switched on by BETA_GATE_PASSWORD and by nothing else. Where that variable
 * is absent — main, production — the first line of `middleware` hands every
 * request straight back, so this file costs a function call and changes no
 * behaviour.
 *
 * The one exception is SITE_NOINDEX: a deployment that sets it without the
 * gate is open to everyone but still marks every response noindex.
 */

export const config = {
  matcher: [
    /*
     * Build output and the icons are excluded here rather than inside the
     * function so they never enter the middleware at all. The gate page is
     * served from this same deployment and has to be able to render: bounce
     * its stylesheet to a login form and the prompt arrives unstyled.
     *
     * Hashed asset filenames are not a secret worth defending. The content
     * behind them is, and that still requires the cookie.
     */
    "/((?!_next/static|_next/image|icons/|favicon.ico|icon.svg|apple-icon.png|sw.js).*)",
  ],
};

/** Paths that stay reachable while the gate is up, and why each one must. */
const ALWAYS_OPEN = new Set([
  // The Docker HEALTHCHECK polls this every 30s. Gated, it reads every reply
  // as a failure, the container never turns healthy, and compose's
  // `depends_on: service_healthy` never releases anything waiting on it.
  "/api/health",
  // Stripe posts subscription changes here with no cookie. Gated, every
  // delivery bounces and nobody's plan ever updates; the route checks
  // Stripe's signature instead.
  "/api/webhooks/stripe",
]);

export async function middleware(request: NextRequest) {
  const password = betaGatePassword();
  if (!password) return siteNoIndex() ? noIndex(NextResponse.next()) : NextResponse.next();

  const { pathname, search } = request.nextUrl;

  if (ALWAYS_OPEN.has(pathname)) return NextResponse.next();

  // robots.ts answers with a blanket disallow while the gate is up, so let
  // crawlers actually read it rather than bouncing them into the prompt.
  if (pathname === "/robots.txt") return noIndex(NextResponse.next());

  const token = request.cookies.get(BETA_GATE_COOKIE)?.value;
  const unlocked = token ? await verifyBetaGateToken(token, password) : false;

  if (pathname === BETA_GATE_PATH) {
    if (!unlocked) return noIndex(NextResponse.next());
    // Already through it — send them where they were originally headed.
    const next = safeNextPath(request.nextUrl.searchParams.get("next")) ?? "/";
    return noIndex(NextResponse.redirect(new URL(next, request.url)));
  }

  if (unlocked) return noIndex(NextResponse.next());

  const gate = new URL(BETA_GATE_PATH, request.url);
  // `/` is where the gate sends people by default, so passing it back as
  // `next` would only put a redundant query string in the address bar.
  if (pathname !== "/") gate.searchParams.set("next", `${pathname}${search}`);
  return noIndex(NextResponse.redirect(gate));
}

/**
 * Belt and braces with robots.txt.
 *
 * This deployment serves production's copy from a different hostname. Indexed,
 * it competes with the real site for its own search results, and a crawler
 * that finds the gate first has no robots.txt in hand yet — the header travels
 * with every response, including the redirect.
 */
function noIndex(response: NextResponse): NextResponse {
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}
