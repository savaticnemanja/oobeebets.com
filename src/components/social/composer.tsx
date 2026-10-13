"use client";

import * as React from "react";
import { useActionState } from "react";
import { BarChartHorizontal, Image as ImageIcon, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { createPostAction, previewLinkAction, type CreatePostState } from "@/app/actions/social";
import type { PostPreview } from "@/lib/social";
import type { GifResult } from "@/lib/giphy";
import {
  POLL_DURATIONS,
  POLL_MAX_OPTIONS,
  POLL_MIN_OPTIONS,
  POLL_OPTION_MAX,
  POST_MAX_LENGTH,
  extractCardUrl,
} from "@/lib/social-rules";
import { uploadMedia } from "@/components/social/composer-media";
import { EmojiPicker } from "@/components/social/emoji-picker";
import { GifPicker } from "@/components/social/gif-picker";
import { Avatar } from "@/components/social/identity";
import { LinkCard } from "@/components/social/link-card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Write a post, or a reply when `parentId` is set.
 *
 * The link card appears while you type, as on X: the last link in the text is
 * previewed after a short pause, through the same server-side fetcher the post
 * will use, so what you see here is what everyone else will see — and the
 * fetch is already cached by the time you press Post.
 *
 * Under the text, as on X: photos (up to four, shrunk and uploaded as soon as
 * they're picked), a GIF, a poll — one kind per post — and, from `sm` up, an
 * emoji picker; a phone keyboard has its own.
 */

/** A photo in the composer: uploading, then uploaded (with its id). */
interface Attachment {
  key: string;
  preview: string;
  kind: "image" | "gif";
  id?: string;
}

const MAX_PHOTOS = 4;
const pollLabel = (h: number) => (h < 24 ? `${h} hour${h === 1 ? "" : "s"}` : `${h / 24} day${h === 24 ? "" : "s"}`);
export function Composer({
  viewerName,
  parentId,
  placeholder = "What's your play today?",
  submitLabel = "Post",
  autoFocus,
  id,
  onPosted,
  onDirtyChange,
  className,
}: {
  viewerName: string;
  parentId?: string;
  placeholder?: string;
  submitLabel?: string;
  autoFocus?: boolean;
  id?: string;
  /** After a successful post — the compose dialog closes itself here. */
  onPosted?: () => void;
  /** Whether anything is written or attached — the compose dialog asks before
   *  throwing it away. Pass a stable function. */
  onDirtyChange?: (dirty: boolean) => void;
  className?: string;
}) {
  const [body, setBody] = React.useState("");
  // Keyed by the URL it was fetched for, so editing the link away hides the
  // card on the next render without an effect having to clear it.
  const [fetched, setFetched] = React.useState<{ url: string; preview: PostPreview | null } | null>(null);
  const formRef = React.useRef<HTMLFormElement>(null);
  const areaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = React.useState<Attachment[]>([]);
  const [gif, setGif] = React.useState<GifResult | null>(null);
  const [poll, setPoll] = React.useState<{ options: string[]; hours: number } | null>(null);
  const [gifOpen, setGifOpen] = React.useState(false);

  function reset() {
    setBody("");
    setFetched(null);
    setPhotos([]);
    setGif(null);
    setPoll(null);
  }

  async function addFiles(files: File[]) {
    const room = MAX_PHOTOS - photos.length;
    if (files.length > room) toast.error(`Up to ${MAX_PHOTOS} photos per post.`);
    const picked = files.slice(0, Math.max(0, room));
    if (picked.some((f) => f.type === "image/gif") && (picked.length > 1 || photos.length > 0)) {
      toast.error("A GIF goes on its own.");
      return;
    }
    const added = picked.map((f) => ({
      key: `${f.name}-${f.size}-${Math.random()}`,
      preview: URL.createObjectURL(f),
      kind: (f.type === "image/gif" ? "gif" : "image") as Attachment["kind"],
      file: f,
    }));
    setPhotos((cur) => [...cur, ...added.map(({ file: _f, ...a }) => a)]);
    await Promise.all(
      added.map(async (a) => {
        try {
          const up = await uploadMedia(a.file);
          setPhotos((cur) => cur.map((p) => (p.key === a.key ? { ...p, id: up.id } : p)));
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Upload failed.");
          setPhotos((cur) => cur.filter((p) => p.key !== a.key));
        }
      }),
    );
  }

  function insertEmoji(emoji: string) {
    const el = areaRef.current;
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? body.length;
    setBody(body.slice(0, start) + emoji + body.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  }

  const [state, action, pending] = useActionState<CreatePostState, FormData>(
    async (prev, formData) => {
      const result = await createPostAction(prev, formData);
      if (result?.ok) {
        reset();
        if (parentId) toast.success("Reply posted");
        else if (onPosted) toast.success("Posted");
        onPosted?.();
      } else if (result && !result.ok) {
        toast.error(result.error);
      }
      return result;
    },
    null,
  );
  void state;

  // Grow with the text instead of scrolling inside a small box.
  React.useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [body]);

  const cardUrl = extractCardUrl(body);
  const fetchedNow = fetched !== null && fetched.url === cardUrl;
  const preview = fetchedNow ? fetched.preview : null;
  const previewing = cardUrl !== null && !fetchedNow;

  React.useEffect(() => {
    if (!cardUrl || fetched?.url === cardUrl) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await previewLinkAction(cardUrl).catch(() => null);
      if (!cancelled) setFetched({ url: cardUrl, preview: result });
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // `fetched` deliberately left out: it changing is the result of this
    // effect, not a reason to run it again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardUrl]);

  const length = body.trim().length;
  const remaining = POST_MAX_LENGTH - length;
  const uploading = photos.some((p) => !p.id);
  const hasMedia = photos.length > 0 || gif !== null;
  const pollReady = poll === null || (length > 0 && poll.options.every((o) => o.trim().length > 0));
  const canPost = (length > 0 || hasMedia) && remaining >= 0 && !pending && !uploading && pollReady;
  // One kind of attachment per post, as on X.
  const canPhoto = !gif && !poll && photos.length < MAX_PHOTOS && !photos.some((p) => p.kind === "gif");
  const canGif = photos.length === 0 && !poll && !gif;
  const canPoll = !hasMedia && !poll;

  const dirty = length > 0 || hasMedia || poll !== null;
  React.useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  return (
    <form
      ref={formRef}
      action={action}
      id={id}
      className={cn("flex gap-3 border-b border-border px-4 py-3", parentId && "scroll-mt-20", className)}
    >
      <Avatar name={viewerName} />
      <div className="min-w-0 flex-1">
        {parentId && <input type="hidden" name="parentId" value={parentId} />}
        {photos.length > 0 && <input type="hidden" name="mediaIds" value={JSON.stringify(photos.map((p) => p.id))} />}
        {gif && <input type="hidden" name="gif" value={JSON.stringify({ url: gif.url, width: gif.width, height: gif.height })} />}
        {poll && <input type="hidden" name="poll" value={JSON.stringify({ options: poll.options.map((o) => o.trim()), hours: poll.hours })} />}
        <label className="sr-only" htmlFor={id ? `${id}-body` : undefined}>
          {placeholder}
        </label>
        <textarea
          id={id ? `${id}-body` : undefined}
          ref={areaRef}
          name="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canPost) {
              e.preventDefault();
              formRef.current?.requestSubmit();
            }
          }}
          placeholder={poll ? "Ask a question" : placeholder}
          autoFocus={autoFocus}
          rows={parentId ? 1 : 2}
          maxLength={POST_MAX_LENGTH * 2}
          className="block w-full resize-none overflow-hidden bg-transparent py-2 text-lg text-fg placeholder:text-fg-subtle focus:outline-none touch:text-lg"
        />

        {previewing && (
          <p className="mt-2 flex items-center gap-2 text-xs text-fg-subtle">
            <Loader2 className="size-3 animate-spin" aria-hidden="true" /> Fetching link preview…
          </p>
        )}
        {preview && !hasMedia && !poll && <LinkCard preview={preview} className="mt-2" />}

        {/* ------------------------------------------------ attachments */}
        {photos.length > 0 && (
          <div className={cn("mt-2 grid gap-2", photos.length > 1 && "grid-cols-2")}>
            {photos.map((p) => (
              <div key={p.key} className="relative overflow-hidden rounded-2xl border border-border bg-surface-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- a local preview of the picked file */}
                <img src={p.preview} alt="" className={cn("w-full object-cover", photos.length > 1 ? "h-40" : "max-h-80")} />
                {!p.id && (
                  <span className="absolute inset-0 grid place-items-center bg-black/50">
                    <Loader2 className="size-6 animate-spin text-white" aria-label="Uploading" />
                  </span>
                )}
                <RemoveButton label="Remove photo" onClick={() => setPhotos((cur) => cur.filter((x) => x.key !== p.key))} />
              </div>
            ))}
          </div>
        )}
        {gif && (
          <div className="relative mt-2 overflow-hidden rounded-2xl border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element -- GIPHY's own CDN */}
            <img src={gif.url} alt="" className="max-h-80 w-full object-cover" />
            <RemoveButton label="Remove GIF" onClick={() => setGif(null)} />
          </div>
        )}
        {poll && (
          <div className="mt-2 rounded-2xl border border-border p-3">
            <div className="space-y-2">
              {poll.options.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={o}
                    onChange={(e) =>
                      setPoll({ ...poll, options: poll.options.map((x, j) => (j === i ? e.target.value : x)) })
                    }
                    maxLength={POLL_OPTION_MAX}
                    placeholder={`Choice ${i + 1}${i >= POLL_MIN_OPTIONS ? " (optional)" : ""}`}
                    aria-label={`Choice ${i + 1}`}
                    className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:border-brand focus:outline-none"
                  />
                  {i >= POLL_MIN_OPTIONS ? (
                    <button
                      type="button"
                      aria-label={`Remove choice ${i + 1}`}
                      onClick={() => setPoll({ ...poll, options: poll.options.filter((_, j) => j !== i) })}
                      className="grid size-8 shrink-0 place-items-center rounded-full text-fg-subtle hover:bg-surface-2 hover:text-fg"
                    >
                      <X className="size-4" aria-hidden="true" />
                    </button>
                  ) : (
                    <span className="size-8 shrink-0" />
                  )}
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
              {poll.options.length < POLL_MAX_OPTIONS ? (
                <button
                  type="button"
                  onClick={() => setPoll({ ...poll, options: [...poll.options, ""] })}
                  className="inline-flex items-center gap-1 font-medium text-brand hover:underline"
                >
                  <Plus className="size-4" aria-hidden="true" /> Add a choice
                </button>
              ) : (
                <span />
              )}
              <label className="flex items-center gap-2 text-fg-muted">
                Poll length
                <select
                  value={poll.hours}
                  onChange={(e) => setPoll({ ...poll, hours: Number(e.target.value) })}
                  className="rounded-md border border-border bg-surface px-2 py-1 text-fg"
                >
                  {POLL_DURATIONS.map((h) => (
                    <option key={h} value={h}>
                      {pollLabel(h)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="button"
              onClick={() => setPoll(null)}
              className="mt-3 w-full rounded-md border-t border-border pt-2 text-sm font-medium text-miss hover:underline"
            >
              Remove poll
            </button>
          </div>
        )}

        {/* ----------------------------------------------------- toolbar */}
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (files.length) void addFiles(files);
          }}
        />
        <GifPicker
          open={gifOpen}
          onOpenChange={setGifOpen}
          onPick={(g) => setGif(g)}
          onUpload={(f) => void addFiles([f])}
        />

        <div className="mt-2 flex items-center justify-between gap-3 border-t border-border pt-2">
          <div className="-ml-2 flex items-center">
            <ToolButton label="Media" disabled={!canPhoto} onClick={() => fileRef.current?.click()}>
              <ImageIcon className="size-5" aria-hidden="true" />
            </ToolButton>
            <ToolButton label="GIF" disabled={!canGif} onClick={() => setGifOpen(true)}>
              <span className="rounded border-[1.5px] border-current px-[3px] text-[0.625rem] font-bold leading-[0.9rem]">GIF</span>
            </ToolButton>
            <ToolButton
              label="Poll"
              disabled={!canPoll}
              onClick={() => setPoll({ options: ["", ""], hours: 24 })}
            >
              <BarChartHorizontal className="size-5" aria-hidden="true" />
            </ToolButton>
            {/* A phone keyboard has its own emoji. */}
            <EmojiPicker onPick={insertEmoji} className="hidden sm:block" />
          </div>
          <div className="flex items-center gap-3">
            {length > 0 && <CharRing remaining={remaining} />}
            <Button type="submit" size="sm" disabled={!canPost} className="rounded-full px-4">
              {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
              {submitLabel}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}

function ToolButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-9 place-items-center rounded-full text-brand transition-colors hover:bg-brand/10 disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-black/70 text-white backdrop-blur hover:bg-black/85"
    >
      <X className="size-4" aria-hidden="true" />
    </button>
  );
}

/** X's countdown ring: fills as you type, shows the number in the last 20. */
function CharRing({ remaining }: { remaining: number }) {
  const used = Math.min(1, (POST_MAX_LENGTH - remaining) / POST_MAX_LENGTH);
  const r = 9;
  const c = 2 * Math.PI * r;
  const color = remaining < 0 ? "var(--color-miss)" : remaining <= 20 ? "var(--color-pending)" : "var(--color-brand)";
  return (
    <span className="flex items-center gap-1.5" aria-live="polite">
      {remaining <= 20 && (
        <span className={cn("num text-xs", remaining < 0 ? "text-miss" : "text-fg-subtle")}>{remaining}</span>
      )}
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true" className="-rotate-90">
        <circle cx="11" cy="11" r={r} fill="none" stroke="var(--color-border-strong)" strokeWidth="2" />
        <circle
          cx="11"
          cy="11"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - used)}
          strokeLinecap="round"
        />
      </svg>
      <span className="sr-only">{remaining} characters left</span>
    </span>
  );
}
