"use client";

import * as React from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * An (i) button with a small explainer panel. A mouse opens it on hover; a
 * tap (or Enter/Space) toggles it. Escape or a tap anywhere else closes it.
 * The panel hangs from the button's right edge, since it sits at the end of a
 * heading row.
 */
export function InfoTip({
  label,
  children,
  className,
}: {
  /** The button's accessible name, e.g. "About the board". */
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const id = React.useId();
  const hovering = React.useRef(false);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      ref={ref}
      className={cn("relative", className)}
      // Mouse only: a tap also fires pointerenter, which would open the panel
      // a moment before the click toggled it shut again.
      onPointerEnter={(e) => {
        if (e.pointerType !== "mouse") return;
        hovering.current = true;
        setOpen(true);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== "mouse") return;
        hovering.current = false;
        setOpen(false);
      }}
    >
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        // Under a hovering mouse the panel is already open; a click there
        // shouldn't close what the user is reading.
        onClick={() => setOpen((v) => (hovering.current ? true : !v))}
        onBlur={(e) => {
          if (!ref.current?.contains(e.relatedTarget as Node)) setOpen(false);
        }}
        className={cn(
          "grid size-9 place-items-center rounded-full text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg",
          "outline-none focus-visible:ring-2 focus-visible:ring-brand",
          open && "text-fg",
        )}
      >
        <Info className="size-5" aria-hidden="true" />
      </button>
      <div
        id={id}
        role="tooltip"
        hidden={!open}
        className="absolute right-0 top-full z-40 mt-1 w-72 max-w-[calc(100vw-2rem)] space-y-2 rounded-xl border border-border-strong bg-surface-2 p-3.5 text-xs leading-relaxed text-fg-muted shadow-2xl"
      >
        {children}
      </div>
    </div>
  );
}
