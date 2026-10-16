import "server-only";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { avatars, users } from "@/db/schema";

/**
 * Profile pictures. Whatever arrives — the browser has already shrunk it to
 * about 1024px — is decoded here and re-encoded from scratch, so nothing of
 * the original survives but its pixels: no EXIF, no GPS, no embedded
 * profiles, no second frame of an animated GIF, no payload hiding in a
 * malformed file.
 *
 * Two sizes, both square WebP:
 *   small  96px — feeds, replies, lists (shown at 20–40px, so sharp at 2x)
 *   large 320px — the profile header (80–96px) with room for 3x screens
 * Typically ~3 KB and ~15 KB. Cropped to the interesting part of the photo
 * (libvips' "attention" strategy finds the face more often than the centre).
 */

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

export const AVATAR_UPLOAD_LIMIT = 950 * 1024;
const LARGE = 320;
const SMALL = 96;

export type AvatarSize = "small" | "large";

export class AvatarError extends Error {}

export async function processAvatar(input: Buffer): Promise<{ small: Buffer; large: Buffer }> {
  let square: Buffer;
  try {
    // limitInputPixels refuses a decompression bomb before it's decoded;
    // rotate() applies the EXIF orientation before the EXIF is dropped.
    square = await sharp(input, { limitInputPixels: 50_000_000, failOn: "error", animated: false })
      .rotate()
      .resize(LARGE, LARGE, { fit: "cover", position: sharp.strategy.attention })
      .png({ compressionLevel: 0 })
      .toBuffer();
  } catch {
    throw new AvatarError("That image couldn't be read. Try a JPEG, PNG or WebP photo.");
  }
  const [large, small] = await Promise.all([
    sharp(square).webp({ quality: 80, effort: 6 }).toBuffer(),
    sharp(square).resize(SMALL, SMALL).webp({ quality: 78, effort: 6 }).toBuffer(),
  ]);
  return { small, large };
}

/** Replaces whatever picture they had; the old one is deleted in the same transaction. */
export async function saveAvatar(userId: string, images: { small: Buffer; large: Buffer }): Promise<string> {
  return db.transaction(async (tx) => {
    // The FK on users.avatar_id clears it as the old row goes.
    await tx.delete(avatars).where(eq(avatars.userId, userId));
    const [row] = await tx.insert(avatars).values({ userId, ...images }).returning({ id: avatars.id });
    await tx.update(users).set({ avatarId: row.id, updatedAt: new Date() }).where(eq(users.id, userId));
    return row.id;
  });
}

export async function removeAvatar(userId: string): Promise<void> {
  await db.delete(avatars).where(eq(avatars.userId, userId));
}

export async function readAvatar(id: string, size: AvatarSize): Promise<Buffer | null> {
  const [row] = await db
    .select({ data: size === "small" ? avatars.small : avatars.large })
    .from(avatars)
    .where(eq(avatars.id, id))
    .limit(1);
  return row?.data ?? null;
}
