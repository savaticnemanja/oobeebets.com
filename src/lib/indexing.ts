/**
 * Whether this deployment asks search engines to leave it out of their index.
 *
 * beta.oobeebets.com serves its own copy of the site on a different hostname,
 * and indexed it would compete with the real site for its own search results.
 * SITE_NOINDEX=1 keeps it out — set on beta only, so main and production stay
 * indexable.
 *
 * Read at run time, so anything that calls this has to be rendered per
 * request, never prerendered.
 */
export function siteNoIndex(): boolean {
  return process.env.SITE_NOINDEX?.trim() === "1";
}
