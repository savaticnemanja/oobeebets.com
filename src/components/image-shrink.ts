"use client";

/**
 * Shrinks a photo in the browser before it's uploaded: down to `maxSide` on
 * the long edge, re-encoded as WebP (JPEG where the browser can't write
 * WebP). Re-encoding also drops the photo's EXIF, location included, before
 * it ever leaves the phone. Keeps uploads well under nginx's 1 MB body limit
 * and quick on a mobile connection.
 */

export const UPLOAD_LIMIT = 950 * 1024;

export async function shrinkImage(file: File, maxSide: number): Promise<{ blob: Blob; width: number; height: number }> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("That image couldn't be read. Try a JPEG, PNG or WebP photo.");
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  // Step the quality down until it fits; a photo almost always fits first try.
  for (const quality of [0.85, 0.75, 0.6, 0.45]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
    // Safari without WebP encoding hands back PNG; JPEG is the fallback then.
    const out =
      blob && blob.type === "image/webp"
        ? blob
        : await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (out && out.size <= UPLOAD_LIMIT) return { blob: out, width, height };
  }
  throw new Error("That photo is too big even after shrinking it.");
}
