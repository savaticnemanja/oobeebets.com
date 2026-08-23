import type { MetadataRoute } from "next";
import { desc, sql } from "drizzle-orm";
import { db } from "@/db";
import { picks, slates } from "@/db/schema";
import { SITE } from "@/lib/site";

/**
 * Only public, indexable pages. /picks, /account and /admin are deliberately
 * absent — they are paid or private surfaces and are noindex at the page level.
 *
 * `lastModified` is read from the data rather than set to `new Date()`. The old
 * version stamped every URL with the build time, which told crawlers that the
 * terms of service changes on every deploy and that the track record never
 * changes between them — both wrong, and lastModified is the one hint here that
 * Google actually uses.
 */
export const revalidate = 3600;

/**
 * This route is prerendered, so both reads below run during `next build` — and
 * at that moment there may be no database to read. CI builds before it
 * migrates, and the Docker image builds against a placeholder DATABASE_URL that
 * points at nothing. Neither is worth failing a build over: a missing date
 * falls back to the build time, and the first revalidation after the app is
 * actually serving replaces it with the real one.
 *
 * The failure is logged rather than swallowed, so a database that is unreachable
 * at *runtime* — where it does matter — still says so.
 */
async function orNull(label: string, read: () => Promise<Date | null>) {
  try {
    return await read();
  } catch (err) {
    console.warn(`[sitemap] ${label} unavailable, falling back to build time:`, err);
    return null;
  }
}

/** Newest settlement, which is what changes the public record. */
async function lastSettlement(): Promise<Date | null> {
  const [row] = await db
    .select({ at: sql<Date | null>`max(${picks.settledAt})` })
    .from(picks);
  return row?.at ? new Date(row.at) : null;
}

/** Newest published slate, which is what changes the board and the homepage. */
async function lastPublish(): Promise<Date | null> {
  const [row] = await db
    .select({ at: slates.publishedAt })
    .from(slates)
    .where(sql`${slates.publishedAt} is not null`)
    .orderBy(desc(slates.publishedAt))
    .limit(1);
  return row?.at ?? null;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [settledAt, publishedAt] = await Promise.all([
    orNull("last settlement", lastSettlement),
    orNull("last publish", lastPublish),
  ]);

  // Deployment time is the floor: it is when the copy on the static pages last
  // changed, and it stands in for the data dates before anything is published.
  const built = new Date();
  const newest = (...dates: (Date | null)[]) =>
    dates.filter((d): d is Date => d !== null).sort((a, b) => b.getTime() - a.getTime())[0] ?? built;

  return [
    // Headline stats come off settled picks, and the seat count off the board.
    { url: SITE.url, lastModified: newest(settledAt, publishedAt), changeFrequency: "daily", priority: 1 },
    { url: `${SITE.url}/about`, lastModified: built, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE.url}/legal/terms`, lastModified: built, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE.url}/legal/privacy`, lastModified: built, changeFrequency: "yearly", priority: 0.2 },
  ];
}
