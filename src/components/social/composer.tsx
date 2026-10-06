"use client";

import * as React from "react";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createPostAction, previewLinkAction, type CreatePostState } from "@/app/actions/social";
import type { PostPreview } from "@/lib/social";
import { POST_MAX_LENGTH, extractCardUrl } from "@/lib/social-rules";
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
 */
export function Composer({
  viewerName,
  parentId,
  placeholder = "What's your play today?",
  submitLabel = "Post",
  autoFocus,
  id,
}: {
  viewerName: string;
  parentId?: string;
  placeholder?: string;
  submitLabel?: string;
  autoFocus?: boolean;
  id?: string;
}) {
  const [body, setBody] = React.useState("");
  // Keyed by the URL it was fetched for, so editing the link away hides the
  // card on the next render without an effect having to clear it.
  const [fetched, setFetched] = React.useState<{ url: string; preview: PostPreview | null } | null>(null);
  const formRef = React.useRef<HTMLFormElement>(null);
  const areaRef = React.useRef<HTMLTextAreaElement>(null);

  const [state, action, pending] = useActionState<CreatePostState, FormData>(
    async (prev, formData) => {
      const result = await createPostAction(prev, formData);
      if (result?.ok) {
        setBody("");
        setFetched(null);
        if (parentId) toast.success("Reply posted");
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
  const canPost = length > 0 && remaining >= 0 && !pending;

  return (
    <form
      ref={formRef}
      action={action}
      id={id}
      className={cn("flex gap-3 border-b border-border px-4 py-3", parentId && "scroll-mt-20")}
    >
      <Avatar name={viewerName} />
      <div className="min-w-0 flex-1">
        {parentId && <input type="hidden" name="parentId" value={parentId} />}
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
          placeholder={placeholder}
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
        {preview && <LinkCard preview={preview} className="mt-2" />}

        <div className="mt-2 flex items-center justify-end gap-3 border-t border-border pt-2">
          {length > 0 && <CharRing remaining={remaining} />}
          <Button type="submit" size="sm" disabled={!canPost} className="rounded-full px-4">
            {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
            {submitLabel}
          </Button>
        </div>
      </div>
    </form>
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
