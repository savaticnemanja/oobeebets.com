"use client";

import * as React from "react";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createPostAction, type CreatePostState } from "@/app/actions/social";
import { POST_MAX_LENGTH } from "@/lib/social-rules";
import { Avatar } from "@/components/social/identity";
import { useViewer } from "@/components/app-shell/viewer";
import { useMentionSuggest } from "@/components/social/mention-suggest";
import { QuoteCard } from "@/components/social/quote-card";
import type { QuotedPost } from "@/lib/social";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Write a post, or a reply when `parentId` is set. Posts are plain text —
 * links and @mentions in it are linked when shown, nothing is attached.
 * Typing "@" suggests people to mention (mention-suggest.tsx); whoever is
 * mentioned is notified.
 */
export function Composer({
  viewerName,
  parentId,
  quote,
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
  /** A quote post: the post it quotes, shown under the text. */
  quote?: QuotedPost;
  placeholder?: string;
  submitLabel?: string;
  autoFocus?: boolean;
  id?: string;
  /** After a successful post — the compose dialog closes itself here. */
  onPosted?: () => void;
  /** Whether anything is written — the compose dialog asks before throwing it
   *  away. Pass a stable function. */
  onDirtyChange?: (dirty: boolean) => void;
  className?: string;
}) {
  const viewer = useViewer();
  const [body, setBody] = React.useState("");
  const formRef = React.useRef<HTMLFormElement>(null);
  const areaRef = React.useRef<HTMLTextAreaElement>(null);
  // Text written by the composer itself — a picked @mention — and where the
  // caret goes after it. The caret is placed in the same commit as the text
  // (the layout effect below), not a frame later: with a frame in between,
  // whatever was typed in that frame landed after the caret and the rest
  // before it, scrambling the words (seen in CI, typing right after picking
  // a mention).
  const caretAfter = React.useRef<number | null>(null);
  const writeBody = React.useCallback((text: string, caret: number) => {
    caretAfter.current = caret;
    setBody(text);
  }, []);
  React.useLayoutEffect(() => {
    const el = areaRef.current;
    const caret = caretAfter.current;
    if (!el || caret === null) return;
    caretAfter.current = null;
    el.focus();
    el.setSelectionRange(caret, caret);
  }, [body]);

  const mentions = useMentionSuggest({
    areaRef,
    value: body,
    setValue: writeBody,
    listId: `${React.useId()}-mentions`,
  });

  const [state, action, pending] = useActionState<CreatePostState, FormData>(
    async (prev, formData) => {
      const result = await createPostAction(prev, formData);
      if (result?.ok) {
        setBody("");
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

  const length = body.trim().length;
  const remaining = POST_MAX_LENGTH - length;
  const canPost = length > 0 && remaining >= 0 && !pending;

  const dirty = length > 0;
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
      <Avatar name={viewerName} avatarId={viewer?.avatarId} />
      <div className="min-w-0 flex-1">
        {parentId && <input type="hidden" name="parentId" value={parentId} />}
        {quote && <input type="hidden" name="quoteId" value={quote.id} />}
        <label className="sr-only" htmlFor={id ? `${id}-body` : undefined}>
          {placeholder}
        </label>
        <div className="relative">
          <textarea
            id={id ? `${id}-body` : undefined}
            ref={areaRef}
            name="body"
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              mentions.sync();
            }}
            onSelect={mentions.sync}
            onBlur={mentions.close}
            {...mentions.inputProps}
            onKeyDown={(e) => {
              if (mentions.onKeyDown(e)) return;
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
          {mentions.element}
        </div>

        {quote && <QuoteCard quote={quote} link={false} className="mt-2" />}

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
