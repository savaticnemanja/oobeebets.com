/**
 * The pre-launch gate.
 *
 * The product is built and sitting in the repo, but nothing is live yet: until
 * launch the only thing a visitor may reach is the newsletter signup, the
 * unsubscribe flow, and the legal pages that collecting an address obliges us
 * to publish. Everything else redirects home.
 *
 * Default-on, and deliberately so. The failure mode of a missing environment
 * variable should be showing a signup form we meant to show, not exposing a
 * product we have not launched. Set PRELAUNCH=0 to lift it.
 *
 * This is read in the proxy, so it is fixed at build time — flipping the flag
 * means a redeploy, which is the right granularity for "have we launched".
 *
 * Imported by both the proxy and the sitemap; keep it free of `server-only` and
 * of anything that touches the database, or the proxy bundle breaks.
 */
export const PRELAUNCH = process.env.PRELAUNCH !== "0";

/** The signup page. `/` is rewritten here, so the address bar still reads `/`. */
export const PRELAUNCH_PATH = "/soon";

/**
 * Reachable while gated. Prefix matches, so `/legal/privacy` covers nothing
 * else and `/api/unsubscribe` does not open the rest of `/api`.
 */
const ALLOWED = [
  PRELAUNCH_PATH,
  "/unsubscribe",
  "/api/unsubscribe",
  "/api/health",
  // Required reading for anyone handing over an email address.
  "/legal/privacy",
  "/legal/terms",
  // The service worker's navigation fallback. Reaching it means the network is
  // already gone, so bouncing it to a page we also cannot fetch helps nobody.
  "/offline",
] as const;

export function isAllowedDuringPrelaunch(pathname: string): boolean {
  return ALLOWED.some(
    (allowed) => pathname === allowed || pathname.startsWith(`${allowed}/`),
  );
}
