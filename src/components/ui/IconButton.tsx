import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * IconButton — UI Governance v1.2
 *
 * Canonical circular icon-button primitive. Extend via `variant` / `size`
 * here instead of restyling inline. Every icon-only affordance (Close,
 * Back, Wishlist, Share, Filter, Sort, Edit, Delete, Overflow, Settings)
 * should route through this primitive so hover/focus semantics stay
 * consistent across the customer surface.
 *
 * Variants:
 *   default  — legacy alias of `glass` (kept for back-compat).
 *   glass    — quiet surface, muted icon.
 *   ghost    — transparent until hover.
 *   solid    — primary CTA gradient (rare).
 *   accent   — subtle brand tint (selected/active affordances).
 *   danger   — destructive actions (delete, remove).
 *   neutral  — flat neutral fill for dense toolbars.
 */
const iconButton = cva(
  "inline-grid place-items-center rounded-full cursor-pointer select-none transition-[background,color,border-color,box-shadow] duration-[var(--motion-button)] ease-[var(--ease-premium)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 disabled:opacity-50 disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--surface-hover)] border border-white/[0.08] text-[color:var(--icon-default)] hover:bg-[var(--surface-active)] hover:text-[color:var(--icon-hover)]",
        glass:
          "bg-white/[0.04] border border-white/[0.08] text-[color:var(--icon-default)] hover:bg-[var(--surface-hover)] hover:text-[color:var(--icon-hover)]",
        ghost:
          "bg-transparent text-[color:var(--icon-default)] hover:bg-[var(--surface-hover)] hover:text-[color:var(--icon-hover)]",
        solid:
          "bg-gradient-primary text-primary-foreground shadow-[var(--shadow-cta)] hover:brightness-105",
        accent:
          "bg-primary/10 border border-primary/25 text-[color:var(--icon-accent)] hover:bg-primary/15",
        danger:
          "bg-transparent text-[color:var(--icon-default)] hover:bg-[color:color-mix(in_oklab,var(--icon-danger)_14%,transparent)] hover:text-[color:var(--icon-danger)]",
        neutral:
          "bg-white/[0.03] text-[color:var(--icon-default)] hover:bg-[var(--surface-hover)] hover:text-[color:var(--icon-hover)]",
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
