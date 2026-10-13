"use client";

/**
 * Client side of photo uploads. Photos are shrunk here before they leave the
 * phone — longest side 1600px, WebP — which keeps them well under nginx's
 * 1 MB body limit and quick on a mobile connection. GIFs go up as they are
 * (re-encoding would drop the animation), so they carry the limit themselves.
 */

export const UPLOAD_LIMIT = 950 * 1024;
const MAX_SIDE = 1600;

export interface Uploaded {
  id: string;
  kind: "image" | "gif";
  src: string;
}

async function shrink(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
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

async function dimensionsOf(file: File): Promise<{ width: number; height: number }> {
  try {
    const bitmap = await createImageBitmap(file);
    const d = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return d;
  } catch {
    return { width: 0, height: 0 };
  }
}

/** Shrinks (unless it's a GIF) and uploads one file; throws with a readable message. */
export async function uploadMedia(file: File): Promise<Uploaded> {
  const isGif = file.type === "image/gif";
  if (!/^image\/(jpeg|png|webp|gif|heic|heif)$/.test(file.type) && file.type !== "") {
    throw new Error("Only photos and GIFs.");
  }
  let blob: Blob = file;
  let dims: { width: number; height: number };
  if (isGif) {
    if (file.size > UPLOAD_LIMIT) throw new Error("That GIF is over 1 MB — try a smaller one.");
    dims = await dimensionsOf(file);
  } else {
    const shrunk = await shrink(file);
    blob = shrunk.blob;
    dims = { width: shrunk.width, height: shrunk.height };
  }
  const form = new FormData();
  form.set("file", blob, isGif ? "upload.gif" : "upload");
  if (dims.width) form.set("width", String(dims.width));
  if (dims.height) form.set("height", String(dims.height));
  const res = await fetch("/api/media", { method: "POST", body: form });
  const body = (await res.json().catch(() => ({}))) as Partial<Uploaded> & { error?: string };
  if (!res.ok || !body.id) throw new Error(body.error ?? "Upload failed — try again.");
  return { id: body.id, kind: body.kind ?? (isGif ? "gif" : "image"), src: body.src ?? `/api/media/${body.id}` };
}
