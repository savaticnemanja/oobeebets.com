"use client";

import * as React from "react";
import { Avatar, TeamBadge, displayNameOf } from "@/components/social/identity";
import type { Role } from "@/db/schema";
import { cn } from "@/lib/utils";

interface Suggestion {
  id: string;
  username: string;
  displayName: string | null;
  role: Role;
}

/** "@" and up to 20 handle characters right before the caret, not inside a word or an email. */
const TYPING_MENTION = /(^|[^\w@])@([a-zA-Z0-9_]{0,20})$/;

/**
 * @mention suggestions for a textarea, as on X: type "@" and the people who
 * fit appear under the box — arrows to move, Enter or Tab to pick, Escape to
 * dismiss. Picking one writes "@handle " in place of what was typed.
 *
 * Returns what the composer wires up: `sync` (call on change and on caret
 * moves), `close` (on blur), `onKeyDown` (true when it used the key), the
 * props for the textarea, and the list to render beside it.
 */
export function useMentionSuggest({
  areaRef,
  value,
  setValue,
  listId,
}: {
  areaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  setValue: (v: string) => void;
  listId: string;
}) {
  const [query, setQuery] = React.useState<{ q: string; start: number } | null>(null);
  const [found, setFound] = React.useState<{ q: string; users: Suggestion[] } | null>(null);
  const [active, setActive] = React.useState(0);
  const [dismissedAt, setDismissedAt] = React.useState<number | null>(null);

  const sync = React.useCallback(() => {
    const el = areaRef.current;
    if (!el || el.selectionStart !== el.selectionEnd) return setQuery(null);
    const m = TYPING_MENTION.exec(el.value.slice(0, el.selectionStart));
    if (!m) return setQuery(null);
    const start = el.selectionStart - m[2].length - 1;
    setQuery((cur) => (cur && cur.q === m[2] && cur.start === start ? cur : { q: m[2], start }));
  }, [areaRef]);

  const q = query?.q ?? null;
  React.useEffect(() => {
    if (q === null) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/mentions?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        if (!res.ok) return;
        const { users } = (await res.json()) as { users: Suggestion[] };
        setFound({ q, users });
        setActive(0);
      } catch {
        // Aborted by the next keystroke, or offline: no list is fine.
      }
    }, 120);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q]);

  const list = query && found?.q === query.q && dismissedAt !== query.start ? found.users : [];
  const open = list.length > 0;

  function pick(user: Suggestion) {
    const el = areaRef.current;
    if (!query || !el) return;
    const end = el.selectionStart;
    const insert = `@${user.username} `;
    setValue(value.slice(0, query.start) + insert + value.slice(end));
    setQuery(null);
    const caret = query.start + insert.length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>): boolean {
    if (!open || !query) return false;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + step + list.length) % list.length);
      return true;
    }
    if ((e.key === "Enter" && !e.metaKey && !e.ctrlKey) || e.key === "Tab") {
      e.preventDefault();
      pick(list[Math.min(active, list.length - 1)]);
      return true;
    }
    if (e.key === "Escape") {
      // Kept from the dialog around the composer, which would close on it.
      e.preventDefault();
      e.stopPropagation();
      setDismissedAt(query.start);
      return true;
    }
    return false;
  }

  const optionId = (i: number) => `${listId}-${i}`;
  const inputProps = {
    "aria-autocomplete": "list" as const,
    "aria-controls": open ? listId : undefined,
    "aria-activedescendant": open ? optionId(Math.min(active, list.length - 1)) : undefined,
  };

  const element = open ? (
    <ul
      id={listId}
      role="listbox"
      aria-label="People to mention"
      // Marks it as part of the composer, so the dialog's Escape leaves the draft alone.
      data-composer-popup
      className="absolute left-0 top-full z-30 mt-1 w-72 max-w-full overflow-hidden rounded-xl border border-border bg-surface-2 py-1 shadow-2xl"
    >
      {list.map((u, i) => (
        <li
          key={u.id}
          id={optionId(i)}
          role="option"
          aria-selected={i === active}
          // mousedown, not click: the textarea keeps focus and its caret.
          onMouseDown={(e) => {
            e.preventDefault();
            pick(u);
          }}
          onMouseEnter={() => setActive(i)}
          className={cn("flex cursor-pointer items-center gap-3 px-3 py-2", i === active && "bg-white/[0.07]")}
        >
          <Avatar name={displayNameOf(u)} size="sm" />
          <span className="min-w-0">
            <span className="flex items-center gap-1 truncate text-sm font-semibold text-fg">
              <span className="truncate">{displayNameOf(u)}</span>
              <TeamBadge role={u.role} />
            </span>
            <span className="block truncate text-sm text-fg-subtle">@{u.username}</span>
          </span>
        </li>
      ))}
    </ul>
  ) : null;

  // Leaving the box closes the list; picking from it doesn't leave the box.
  const close = React.useCallback(() => setQuery(null), []);

  return { sync, close, onKeyDown, inputProps, element };
}
