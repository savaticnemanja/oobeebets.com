"use client";

import * as React from "react";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Send, TestTube2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/misc";
import {
  sendAnnouncementAction,
  sendTestAnnouncementAction,
} from "@/app/actions/announce";
import { announcementEmail } from "@/lib/email/templates";
import {
  audienceValues,
  AUDIENCE_LABELS,
  parseAddressList,
  type Audience,
} from "@/lib/validation";
import { cn } from "@/lib/utils";

interface Account {
  email: string;
  role: string;
}

export function AnnounceComposer({ accounts }: { accounts: Account[] }) {
  const [sendState, sendAction, sendPending] = useActionState(sendAnnouncementAction, null);
  const [testState, testAction, testPending] = useActionState(
    sendTestAnnouncementAction,
    null,
  );

  const [heading, setHeading] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<Audience>("all");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [extra, setExtra] = useState("");
  const [confirm, setConfirm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const formRef = useRef<HTMLFormElement>(null);

  // Toasts talk to something outside React, so they belong in an effect.
  useEffect(() => {
    if (sendState?.ok) toast.success(sendState.message ?? "Sent");
    else if (sendState && !sendState.ok) toast.error(sendState.error);
  }, [sendState]);

  // Clearing the composer is a state adjustment rather than a side effect, so
  // it happens in render — no extra commit, and no dialog left standing open
  // for a frame after the send resolved. Same pattern as SlatePickList.
  const [lastSend, setLastSend] = useState(sendState);
  if (lastSend !== sendState) {
    setLastSend(sendState);
    setDialogOpen(false);
    setConfirm("");
    if (sendState?.ok) {
      setHeading("");
      setBody("");
    }
  }

  useEffect(() => {
    if (testState?.ok) toast.success(testState.message ?? "Test sent");
    else if (testState && !testState.ok) toast.error(testState.error);
  }, [testState]);

  /** The custom list, as the server will parse it — picked accounts plus typed extras. */
  const customList = useMemo(
    () => [...new Set([...picked, ...parseAddressList(extra)])],
    [picked, extra],
  );

  const recipientCount =
    audience === "custom"
      ? customList.length
      : audience === "testers"
        ? accounts.filter((a) => a.role === "user").length
        : accounts.length;

  // The same function the server sends with, so this is the email itself
  // rather than a mock-up of it that can drift.
  const preview = useMemo(
    () =>
      announcementEmail({
        heading: heading.trim() || "Your heading",
        body: body.trim() || "Your content goes here.",
      }),
    [heading, body],
  );

  const ready = heading.trim().length > 0 && body.trim().length > 0;
  const canSend = ready && recipientCount > 0 && !sendPending;
  const fe = sendState && !sendState.ok ? sendState.fieldErrors : undefined;

  function toggle(email: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  }

  return (
    <form ref={formRef} action={sendAction} className="grid gap-8 lg:grid-cols-[1fr_420px]">
      {/* ----------------------------------------------------------- compose */}
      <div>
        <div>
          <Label htmlFor="ann-heading">Heading</Label>
          <Input
            id="ann-heading"
            name="heading"
            value={heading}
            onChange={(e) => setHeading(e.target.value)}
            maxLength={120}
            required
            placeholder="The board is moving to 6am ET"
            className="mt-1.5"
            aria-invalid={Boolean(fe?.heading)}
            aria-describedby={fe?.heading ? "ann-heading-error" : "ann-heading-hint"}
          />
          <p id="ann-heading-hint" className="mt-1.5 text-xs text-fg-subtle">
            Doubles as the email&apos;s subject line. {120 - heading.length} left.
          </p>
          {fe?.heading && (
            <p id="ann-heading-error" className="mt-1.5 text-xs text-miss">
              {fe.heading[0]}
            </p>
          )}
        </div>

        <div className="mt-5">
          <Label htmlFor="ann-body">Content</Label>
          <Textarea
            id="ann-body"
            name="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={5000}
            required
            rows={12}
            placeholder={"Write the announcement here.\n\nLeave a blank line between paragraphs."}
            className="mt-1.5 min-h-56"
            aria-invalid={Boolean(fe?.body)}
            aria-describedby={fe?.body ? "ann-body-error" : "ann-body-hint"}
          />
          <p id="ann-body-hint" className="mt-1.5 text-xs text-fg-subtle">
            Plain text. A blank line starts a new paragraph. {5000 - body.length} left.
          </p>
          {fe?.body && (
            <p id="ann-body-error" className="mt-1.5 text-xs text-miss">
              {fe.body[0]}
            </p>
          )}
        </div>

        {/* -------------------------------------------------------- audience */}
        <fieldset className="mt-8">
          <legend className="text-sm font-semibold tracking-tight">Audience</legend>
          <input type="hidden" name="audience" value={audience} />

          <div className="mt-3 flex flex-wrap gap-2">
            {audienceValues.map((value) => {
              const active = audience === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setAudience(value)}
                  aria-pressed={active}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-sm transition-colors",
                    active
                      ? "border-brand/50 bg-brand/10 text-brand"
                      : "border-border text-fg-muted hover:border-border-strong hover:text-fg",
                  )}
                >
                  {AUDIENCE_LABELS[value]}
                </button>
              );
            })}
          </div>

          {audience === "custom" ? (
            <div className="mt-4">
              <input type="hidden" name="recipients" value={customList.join("\n")} />

              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-fg-subtle">
                  Pick from existing accounts, type any other addresses, or both.
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setPicked((prev) =>
                      prev.size === accounts.length
                        ? new Set()
                        : new Set(accounts.map((a) => a.email)),
                    )
                  }
                >
                  {picked.size === accounts.length ? "Clear all" : "Select all"}
                </Button>
              </div>

              <ul className="card-hairline mt-2 max-h-56 overflow-y-auto p-1">
                {accounts.map((a) => (
                  <li key={a.email}>
                    <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-surface-2">
                      <input
                        type="checkbox"
                        checked={picked.has(a.email)}
                        onChange={() => toggle(a.email)}
                        className="size-4 accent-brand"
                      />
                      <span className="min-w-0 flex-1 truncate text-fg">{a.email}</span>
                      {a.role !== "user" && <Badge variant="brand">{a.role}</Badge>}
                    </label>
                  </li>
                ))}
                {accounts.length === 0 && (
                  <li className="px-2 py-3 text-sm text-fg-muted">No accounts yet.</li>
                )}
              </ul>

              <div className="mt-3">
                <Label htmlFor="ann-extra">Other addresses</Label>
                <Textarea
                  id="ann-extra"
                  value={extra}
                  onChange={(e) => setExtra(e.target.value)}
                  rows={2}
                  placeholder="someone@example.com, another@example.com"
                  className="mt-1.5"
                  aria-describedby="ann-extra-hint"
                />
                <p id="ann-extra-hint" className="mt-1.5 text-xs text-fg-subtle">
                  Commas, spaces or one per line. They don&apos;t need an account.
                </p>
              </div>
              {fe?.recipients && (
                <p className="mt-1.5 text-xs text-miss">{fe.recipients[0]}</p>
              )}
            </div>
          ) : (
            <p className="mt-3 text-xs text-fg-subtle">
              {audience === "all"
                ? "Everyone with an account, you included."
                : "Accounts with the tester role — admins are skipped."}
            </p>
          )}
        </fieldset>

        {/* ----------------------------------------------------------- send */}
        <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-border pt-6">
          <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <AlertDialogTrigger asChild>
              <Button type="button" disabled={!canSend}>
                {sendPending && <Loader2 className="animate-spin" aria-hidden="true" />}
                <Send aria-hidden="true" />
                Send announcement
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogTitle>
                Send to {recipientCount} {recipientCount === 1 ? "person" : "people"}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This goes out immediately and cannot be recalled. Each person gets
                their own copy — nobody sees anyone else&apos;s address.
              </AlertDialogDescription>

              {/* Unnamed on purpose. The dialog is portalled out of the form,
                  so a field in here would never be submitted with it — the
                  value reaches the action through the hidden input below. */}
              <div className="mt-4">
                <Label htmlFor="ann-confirm">
                  Type <span className="font-semibold text-fg">SEND</span> to confirm
                </Label>
                <Input
                  id="ann-confirm"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="off"
                  placeholder="SEND"
                  className="mt-1.5"
                />
              </div>

              <AlertDialogFooter>
                <AlertDialogCancel asChild>
                  <Button type="button" variant="outline" onClick={() => setConfirm("")}>
                    Cancel
                  </Button>
                </AlertDialogCancel>
                <AlertDialogAction
                  disabled={confirm !== "SEND" || sendPending}
                  onClick={(e) => {
                    // preventDefault stops Radix closing the dialog on click,
                    // so it stays up showing the pending state; the effect that
                    // handles the result closes it once the send resolves.
                    e.preventDefault();
                    formRef.current?.requestSubmit();
                  }}
                >
                  {sendPending && <Loader2 className="animate-spin" aria-hidden="true" />}
                  Send it
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Mirrors the dialog's box, because the dialog is portalled outside
              the form and its own input would never be submitted with it. */}
          <input type="hidden" name="confirm" value={confirm} />

          <Button
            type="submit"
            variant="outline"
            formAction={testAction}
            disabled={!ready || testPending}
          >
            {testPending && <Loader2 className="animate-spin" aria-hidden="true" />}
            <TestTube2 aria-hidden="true" />
            Send test to me
          </Button>

          <p className="text-xs text-fg-subtle">
            {ready
              ? `${recipientCount} ${recipientCount === 1 ? "recipient" : "recipients"} selected.`
              : "Add a heading and content first."}
          </p>
        </div>
      </div>

      {/* ----------------------------------------------------------- preview */}
      <div className="lg:sticky lg:top-24 lg:self-start">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold tracking-tight">Preview</h2>
          <span className="text-xs text-fg-subtle">The actual email</span>
        </div>
        <p className="mt-1 truncate text-xs text-fg-muted">
          Subject: <span className="text-fg">{preview.subject}</span>
        </p>
        <iframe
          title="Email preview"
          srcDoc={preview.html}
          sandbox=""
          className="card-hairline mt-3 h-[32rem] w-full bg-white"
        />
      </div>
    </form>
  );
}
