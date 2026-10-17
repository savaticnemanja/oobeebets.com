"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/social/identity";
import { Button } from "@/components/ui/button";
import { shrinkImage } from "@/components/image-shrink";

/**
 * Upload size: the server crops to a 320px square anyway (lib/avatars.ts),
 * so anything past ~1024px on the long edge is bytes nobody sees.
 */
const AVATAR_MAX_SIDE = 1024;

/**
 * Your profile picture, on the account page. The photo is shrunk in the
 * browser, then /api/avatar crops, re-encodes and stores it. A refresh
 * afterwards puts the new picture in the sidebar and the composer too.
 */
export function AvatarPicker({ name, avatarId }: { name: string; avatarId: string | null }) {
  const router = useRouter();
  const input = React.useRef<HTMLInputElement>(null);
  const [current, setCurrent] = React.useState(avatarId);
  const [busy, setBusy] = React.useState<"upload" | "remove" | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function upload(file: File) {
    setBusy("upload");
    setError(null);
    try {
      const { blob } = await shrinkImage(file, AVATAR_MAX_SIDE);
      const form = new FormData();
      form.set("file", blob, "avatar");
      const res = await fetch("/api/avatar", { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !body.id) throw new Error(body.error ?? "Couldn't save that picture — try again.");
      setCurrent(body.id);
      toast.success("Profile picture updated");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that picture — try again.");
    } finally {
      setBusy(null);
      // The same file can be chosen again after an error.
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    setBusy("remove");
    setError(null);
    try {
      const res = await fetch("/api/avatar", { method: "DELETE" });
      if (!res.ok) throw new Error("Couldn't remove it — try again.");
      setCurrent(null);
      toast.success("Profile picture removed");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove it — try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar name={name} avatarId={current} size="lg" />
      <div className="min-w-0">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="subtle"
            size="sm"
            className="rounded-full"
            disabled={busy !== null}
            onClick={() => input.current?.click()}
          >
            {busy === "upload" ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Camera aria-hidden="true" />}
            {current ? "Change picture" : "Add a picture"}
          </Button>
          {current && (
            <Button type="button" variant="ghost" size="sm" className="rounded-full" disabled={busy !== null} onClick={remove}>
              {busy === "remove" ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
              Remove
            </Button>
          )}
        </div>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          className="sr-only"
          tabIndex={-1}
          aria-label="Profile picture"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />
        {error ? (
          <p role="alert" className="mt-2 text-xs text-miss">
            {error}
          </p>
        ) : (
          <p className="mt-2 text-xs text-fg-subtle">A photo, cropped square. Shown next to your posts and on your profile.</p>
        )}
      </div>
    </div>
  );
}
