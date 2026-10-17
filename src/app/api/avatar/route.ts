import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getAuth, rateLimit } from "@/lib/auth";
import { AVATAR_UPLOAD_LIMIT, AvatarError, processAvatar, removeAvatar, saveAvatar, sniffImage } from "@/lib/avatars";
import { avatarSrc } from "@/lib/avatar-src";

/** Set your profile picture: one image, multipart, field `file`. */
export async function POST(request: Request) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: "Sign in to change your picture." }, { status: 401 });
  if (!(await rateLimit("avatar:upload", auth.user.id, 10, 60 * 60 * 1000))) {
    return NextResponse.json({ error: "That's a lot of new pictures — try again in a while." }, { status: 429 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file." }, { status: 400 });
  if (file.size > AVATAR_UPLOAD_LIMIT) {
    return NextResponse.json({ error: "That file is too big — the limit is under 1 MB." }, { status: 413 });
  }
  const data = Buffer.from(await file.arrayBuffer());
  if (!sniffImage(data)) return NextResponse.json({ error: "Only JPEG, PNG, WebP or GIF images." }, { status: 415 });

  try {
    const id = await saveAvatar(auth.user.id, await processAvatar(data));
    revalidatePath(`/u/${auth.user.username}`);
    return NextResponse.json({ id, src: avatarSrc(id, "large") });
  } catch (err) {
    if (err instanceof AvatarError) return NextResponse.json({ error: err.message }, { status: 415 });
    console.error("[avatar] upload failed:", err);
    return NextResponse.json({ error: "Couldn't save that picture — try again." }, { status: 500 });
  }
}

/** Back to the initial. */
export async function DELETE() {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: "Sign in to change your picture." }, { status: 401 });
  await removeAvatar(auth.user.id);
  revalidatePath(`/u/${auth.user.username}`);
  return NextResponse.json({ ok: true });
}
