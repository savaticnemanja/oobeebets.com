import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-200 disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.98] motion-reduce:active:scale-100",
  {
    variants: {
      variant: {
        default:
          "bg-brand text-black font-semibold hover:bg-brand-bright hover:shadow-[0_0_28px_-6px_var(--color-brand-glow)]",
        outline:
          "border border-border-strong bg-transparent text-fg hover:bg-surface-2 hover:border-brand/50",
        ghost: "text-fg-muted hover:bg-surface-2 hover:text-fg",
        subtle: "bg-surface-2 text-fg border border-border hover:bg-surface-3",
        danger:
          "bg-miss-dim text-miss border border-miss/30 hover:bg-miss hover:text-black",
        hit: "bg-hit-dim text-hit border border-hit/30 hover:bg-hit hover:text-black",
        link: "text-brand underline-offset-4 hover:underline p-0 h-auto",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        default: "h-10 px-4",
        lg: "h-12 px-7 text-base",
        icon: "size-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ComponentProps<"button">,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}

export { Button, buttonVariants };
