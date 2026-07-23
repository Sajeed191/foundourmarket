import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * IconButton — UI Governance v1
 *
 * The canonical circular icon-button primitive for Close, Back, Wishlist,
 * Share, Filter, Sort, Edit, Delete, Overflow, Settings, and every other
 * icon-only affordance. Consumes shared glass tokens (--motion-button,
 * --ease-premium, glass-icon-btn utility). Never restyle inline; extend
 * via `variant` / `tone` / `size` here instead.
 */
const iconButton = cva(
  "inline-grid place-items-center rounded-full cursor-pointer select-none transition-[background,color,border-color,box-shadow] duration-[var(--motion-button)] ease-[var(--ease-premium)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 disabled:opacity-50 disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        glass:
          "bg-white/[0.04] border border-white/[0.08] text-muted-foreground hover:bg-white/[0.08] hover:text-foreground",
        ghost:
          "bg-transparent text-muted-foreground hover:bg-white/[0.06] hover:text-foreground",
        solid:
          "bg-gradient-primary text-primary-foreground shadow-[var(--shadow-cta)] hover:brightness-105",
        accent:
          "bg-primary/10 border border-primary/25 text-accent hover:bg-primary/15",
      },
      size: {
        sm: "h-8 w-8 [&_svg]:size-3.5",
        md: "h-9 w-9 [&_svg]:size-4",
        lg: "h-11 w-11 [&_svg]:size-4",
      },
    },
    defaultVariants: { variant: "glass", size: "lg" },
  },
);

export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof iconButton> {
  asChild?: boolean;
  "aria-label": string; // required — icon buttons must be labelled
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant, size, asChild, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : "button"}
        className={cn(iconButton({ variant, size }), className)}
        {...props}
      />
    );
  },
);
IconButton.displayName = "IconButton";
