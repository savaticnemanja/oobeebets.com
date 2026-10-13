import { NextResponse } from "next/server";
import { getAuth, rateLimit } from "@/lib/auth";
import { MAX_UPLOAD_BYTES, saveUpload, sniffImage } from "@/lib/media";

/**
 * Upload one image or GIF for a post being written. A route rather than a
 * server action: actions are capped at 1 MB of form data including overhead,
 * and this wants a plain multipart body. Returns the id the post will attach.
 */
export async function POST(request: Request) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: "Sign in to upload." }, { status: 401 });
  if (!(await rateLimit("media:upload", auth.user.id, 40, 10 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many uploads — try again in a few minutes." }, { status: 429 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file." }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "That file is too big — the limit is under 1 MB." }, { status: 413 });
  }
  const data = Buffer.from(await file.arrayBuffer());
  const mime = sniffImage(data);
  if (!mime) return NextResponse.json({ error: "Only JPEG, PNG, WebP or GIF images." }, { status: 415 });

  const dim = (key: string) => {
    const n = Number(form?.get(key));
    return Number.isInteger(n) && n > 0 && n < 20000 ? n : null;
  };
  const saved = await saveUpload({ uploaderId: auth.user.id, data, mime, width: dim("width"), height: dim("height") });
  return NextResponse.json({ id: saved.id, kind: saved.kind, src: `/api/media/${saved.id}` });
}
