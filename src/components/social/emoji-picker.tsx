"use client";

import * as React from "react";
import { Smile } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A small emoji picker for the composer on a desktop — a phone keyboard has
 * its own, which is why the composer hides this below `sm`. A short curated
 * set rather than all 3,000+: the ones a betting timeline actually uses.
 */
const GROUPS: Array<{ label: string; emoji: string[] }> = [
  { label: "Faces", emoji: "😀 😂 🤣 😅 😊 😍 😎 🤔 😬 😭 😤 😡 🤯 🥶 🥵 😴 🤑 🤞 🙏 👏 👀 💀".split(" ") },
  { label: "Hands", emoji: "👍 👎 👌 ✌️ 🤝 💪 🫡 🙌 👊 ☝️".split(" ") },
  { label: "Sports", emoji: "⚽ 🏀 ⚾ 🏈 🏒 🎾 🏆 🥇 🎯 🏟️ ⏱️ 🧢".split(" ") },
  { label: "Betting", emoji: "💰 💵 💸 🤑 📈 📉 🔥 ❄️ 🚀 💎 🎲 🍀 ✅ ❌ ⚠️ 🔒".split(" ") },
  { label: "Other", emoji: "❤️ 💯 🎉 🍻 ☕ 🧠 🐐 🐍 🤡 👑".split(" ") },
];

export function EmojiPicker({ onPick, className }: { onPick: (emoji: string) => void; className?: string }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        aria-label="Emoji"
        aria-expanded={open}
        title="Emoji"
        onClick={() => setOpen((v) => !v)}
        className="grid size-9 place-items-center rounded-full text-brand transition-colors hover:bg-brand/10"
      >
        <Smile className="size-5" aria-hidden="true" />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Emoji"
          // The compose dialog looks for this to leave Escape to the panel.
          data-composer-popup=""
          className="absolute left-0 top-full z-50 mt-1 max-h-72 w-72 overflow-y-auto rounded-xl border border-border-strong bg-surface-2 p-2 shadow-2xl"
        >
          {GROUPS.map((g) => (
            <div key={g.label} className="mb-1">
              <p className="px-1 pb-1 pt-1.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-fg-subtle">{g.label}</p>
              <div className="grid grid-cols-8">
                {g.emoji.map((e) => (
                  <button
                    key={g.label + e}
                    type="button"
                    onClick={() => onPick(e)}
                    className="grid size-8 place-items-center rounded-md text-xl hover:bg-surface-3"
                    aria-label={`Insert ${e}`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
