import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[0.6875rem] font-medium uppercase tracking-wider transition-colors",
  {
    variants: {
      variant: {
        default: "border-border bg-surface-2 text-fg-muted",
        brand: "border-brand/30 bg-brand/10 text-brand",
        hit: "border-hit/30 bg-hit-dim text-hit",
        miss: "border-miss/30 bg-miss-dim text-miss",
        pending: "border-pending/30 bg-pending-dim text-pending",
        void: "border-border bg-surface-2 text-void line-through",
        outline: "border-border-strong bg-transparent text-fg-muted",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.ComponentProps<"span">,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
