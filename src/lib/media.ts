import "server-only";
import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { postMedia } from "@/db/schema";

/**
 * Uploads for posts. The browser shrinks photos before sending them (see
 * components/social/composer-media.tsx), so what arrives is small; this side
 * only checks it is what it says it is and stores it.
 */

/** Just under nginx's default 1 MB request body limit, with room for the form. */
export const MAX_UPLOAD_BYTES = 950 * 1024;
export const MAX_MEDIA_PER_POST = 4;

/** The type a file really is, from its first bytes — never from its name or the browser's say-so. */
export function sniffImage(buf: Buffer): "image/jpeg" | "image/png" | "image/gif" | "image/webp" | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length >= 6 && buf.subarray(0, 4).toString("latin1") === "GIF8") return "image/gif";
  if (buf.length >= 12 && buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") {
    return "image/webp";
  }
  return null;
}

/**
 * Stores one upload, unattached until its post is created. Also sweeps this
 * person's uploads that never made it into a post — a composer closed with a
 * photo in it — once they are a day old, so abandoned files don't pile up.
 */
export async function saveUpload(opts: {
  uploaderId: string;
  data: Buffer;
  mime: string;
  width: number | null;
  height: number | null;
}): Promise<{ id: string; kind: "image" | "gif" }> {
  const kind = opts.mime === "image/gif" ? "gif" : "image";
  await db
    .delete(postMedia)
    .where(
      and(
        eq(postMedia.uploaderId, opts.uploaderId),
        isNull(postMedia.postId),
        lt(postMedia.createdAt, sql`now() - interval '1 day'`),
      ),
    );
  const [row] = await db
    .insert(postMedia)
    .values({ uploaderId: opts.uploaderId, kind, mime: opts.mime, data: opts.data, width: opts.width, height: opts.height })
    .returning({ id: postMedia.id });
  return { id: row.id, kind };
}

/** One stored file, for the /api/media/[id] route. */
export async function readUpload(id: string): Promise<{ mime: string; data: Buffer } | null> {
  const [row] = await db
    .select({ mime: postMedia.mime, data: postMedia.data })
    .from(postMedia)
    .where(eq(postMedia.id, id))
    .limit(1);
  return row?.data ? { mime: row.mime, data: row.data } : null;
}

/** A post's media as the feed shows it. */
export interface MediaView {
  id: string;
  kind: "image" | "gif";
  src: string;
  width: number | null;
  height: number | null;
}

/** Media for a page of posts, keyed by post id, in order. One query. */
export async function getMediaFor(postIds: string[]): Promise<Map<string, MediaView[]>> {
  if (postIds.length === 0) return new Map();
  const rows = await db
    .select({
      id: postMedia.id,
      postId: postMedia.postId,
      kind: postMedia.kind,
      url: postMedia.url,
      width: postMedia.width,
      height: postMedia.height,
    })
    .from(postMedia)
    .where(inArray(postMedia.postId, postIds))
    .orderBy(postMedia.position);
  const out = new Map<string, MediaView[]>();
  for (const r of rows) {
    const list = out.get(r.postId!) ?? [];
    list.push({
      id: r.id,
      kind: r.kind === "gif" ? "gif" : "image",
      src: r.url ?? `/api/media/${r.id}`,
      width: r.width,
      height: r.height,
    });
    out.set(r.postId!, list);
  }
  return out;
}
