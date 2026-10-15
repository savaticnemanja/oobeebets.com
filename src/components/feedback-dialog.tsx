"use client";

import * as React from "react";
import { useActionState, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { sendFeedbackAction } from "@/app/actions/feedback";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  FEEDBACK_KIND_LABELS,
  FEEDBACK_MAX_LENGTH,
  feedbackKindValues,
  type FeedbackKindValue,
} from "@/lib/validation";
import { cn } from "@/lib/utils";

/**
 * "Send feedback", from any signed-in page. Opened by `children` — the
 * sidebar's button — or held open by the caller, as the phone drawer does so
 * it can close itself first. The page it was opened on goes along with it.
 *
 * The draft lives up here rather than inside the dialog, so closing it by
 * accident and opening it again doesn't lose what was typed.
 */
export function FeedbackDialog({
  children,
  open: openProp,
  onOpenChange,
}: {
  children?: React.ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const pathname = usePathname();
  const [state, action, pending] = useActionState(sendFeedbackAction, null);
  const [ownOpen, setOwnOpen] = useState(false);
  const open = openProp ?? ownOpen;
  const setOpen = onOpenChange ?? setOwnOpen;

  const [kind, setKind] = useState<FeedbackKindValue | null>(null);
  const [body, setBody] = useState("");

  // Closing is in an effect, not render: when the drawer holds the dialog
  // open, `setOpen` is the drawer's state, and a component may not set
  // another's state while rendering.
  useEffect(() => {
    if (!state?.ok) return;
    toast.success(state.message ?? "Sent");
    setOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per result
  }, [state]);

  // Sent: clear the draft in render rather than an effect — the same pattern
  // as the announce composer.
  const [lastState, setLastState] = useState(state);
  if (lastState !== state) {
    setLastState(state);
    if (state?.ok) {
      setKind(null);
      setBody("");
    }
  }

  const error = state && !state.ok ? state.error : null;
  const ready = kind !== null && body.trim().length > 0 && !pending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send feedback</DialogTitle>
          <DialogDescription>
            Found a bug or have an idea? It goes straight to the Oobee team.
          </DialogDescription>
        </DialogHeader>

        <form action={action}>
          <input type="hidden" name="pagePath" value={pathname} />
          <input type="hidden" name="kind" value={kind ?? ""} />

          <fieldset>
            <legend className="text-sm font-medium text-fg">What&apos;s it about?</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {feedbackKindValues.map((value) => {
                const active = kind === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setKind(value)}
                    aria-pressed={active}
                    className={cn(
                      "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                      active
                        ? "border-brand/50 bg-brand/10 text-brand"
                        : "border-border text-fg-muted hover:border-border-strong hover:text-fg",
                    )}
                  >
                    {FEEDBACK_KIND_LABELS[value]}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <label htmlFor="feedback-body" className="mt-5 block text-sm font-medium text-fg">
            Tell us more
          </label>
          <Textarea
            id="feedback-body"
            name="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={FEEDBACK_MAX_LENGTH}
            required
            rows={6}
            placeholder={
              kind === "bug"
                ? "What happened, and what did you expect instead?"
                : "What's on your mind?"
            }
            className="mt-1.5 min-h-36"
            aria-describedby="feedback-hint"
          />
          <p id="feedback-hint" className="mt-1.5 text-xs text-fg-subtle">
            We&apos;ll see your name, this page and your browser with it.{" "}
            <span className="num">{FEEDBACK_MAX_LENGTH - body.length}</span> left.
          </p>
          {error && (
            <p role="alert" className="mt-2 text-sm text-miss">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="submit" disabled={!ready}>
              {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
              Send
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
