import * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        // `touch:text-base` is 16px, the size below which iOS zooms the
        // viewport on focus. Not a design preference — see globals.css.
        "flex h-10 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm touch:text-base text-fg",
        "placeholder:text-fg-subtle",
        "transition-colors duration-200",
        "hover:border-border-strong",
        "focus:border-brand/60 focus:bg-surface-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-[invalid=true]:border-miss/60",
        "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-fg",
        className,
      )}
      {...props}
    />
  );
}

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "flex min-h-20 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm touch:text-base text-fg",
        "placeholder:text-fg-subtle transition-colors duration-200",
        "hover:border-border-strong focus:border-brand/60 focus:bg-surface-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-[invalid=true]:border-miss/60",
        className,
      )}
      {...props}
    />
  );
}

export { Input, Textarea };
