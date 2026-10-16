import { readAvatar } from "@/lib/avatars";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Serves a profile picture. A new picture gets a new id, so one id's bytes
 * never change: cached for a year, by the browser and anything in between.
 * The pictures are public anyway — they sit next to public posts.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; size: string }> }) {
  const { id, size } = await params;
  if (!UUID.test(id) || (size !== "small" && size !== "large")) return new Response("Not found", { status: 404 });
  const data = await readAvatar(id, size);
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(data.length),
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
