/**
 * The users directory's query — what is in its URL. Shared by the page (a
 * server component, which builds the pager's links) and the directory's
 * controls (a client component), so it lives in neither.
 */

export const USER_FILTERS = ["all", "user", "admin", "quiet"] as const;
export type UserFilter = (typeof USER_FILTERS)[number];
export const USER_SORTS = ["newest", "active", "bets", "posts"] as const;
export type UserSort = (typeof USER_SORTS)[number];

export interface DirectoryQuery {
  q: string;
  filter: UserFilter;
  sort: UserSort;
}

/** The directory's URL for a query — every control is a link, so back works. */
export function directoryHref({ q, filter, sort }: DirectoryQuery, page = 1): string {
  const p = new URLSearchParams();
  if (q) p.set("q", q);
  if (filter !== "all") p.set("filter", filter);
  if (sort !== "newest") p.set("sort", sort);
  if (page > 1) p.set("page", String(page));
  const s = p.toString();
  return `/admin/users${s ? `?${s}` : ""}`;
}
