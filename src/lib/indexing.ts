import { betaGatePassword } from "@/lib/beta-gate";

/**
 * Whether this deployment asks search engines to leave it out of their index.
 *
 * beta.oobeebets.com serves its own copy of the site on a different hostname,
 * and indexed it would compete with the real site for its own search results.
 * The gate used to be what kept it out. With the gate off, SITE_NOINDEX=1
 * keeps it out on its own — set on beta only, so main and production stay
 * indexable.
 *
 * Read at run time like the gate's password, so anything that calls this has
 * to be rendered per request, never prerendered.
 */
export function siteNoIndex(): boolean {
  return betaGatePassword() !== null || process.env.SITE_NOINDEX?.trim() === "1";
}
