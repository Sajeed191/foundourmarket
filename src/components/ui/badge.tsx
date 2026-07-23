import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Badge / Chip — Premium UI System v4.0
 *
 * Five canonical semantic variants used across the whole site:
 *   neutral   — default surface chip
 *   selected  — active state, orange
 *   success   — emerald (in stock, verified, etc.)
 *   warning   — amber (low stock, pending)
 *   info      — blue (informational)
 *
 * Legacy variant names (default, secondary, destructive, outline) alias to
 * these so existing call sites keep working.
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-[var(--radius-chip)] border px-2.5 py-0.5 text-xs font-medium transition-colors duration-[var(--duration-fast)]",
  {
    variants: {
      variant: {
        neutral:
          "bg-[color:var(--chip-neutral-bg)] text-[color:var(--chip-neutral-fg)] border-[color:var(--chip-neutral-border)]",
        selected:
          "bg-[color:var(--chip-selected-bg)] text-[color:var(--chip-selected-fg)] border-[color:var(--chip-selected-border)]",
        success:
          "bg-[color:var(--chip-success-bg)] text-[color:var(--chip-success-fg)] border-[color:var(--chip-success-border)]",
        warning:
          "bg-[color:var(--chip-warning-bg)] text-[color:var(--chip-warning-fg)] border-[color:var(--chip-warning-border)]",
        info:
          "bg-[color:var(--chip-info-bg)] text-[color:var(--chip-info-fg)] border-[color:var(--chip-info-border)]",
        // ── Aliases for legacy call sites ─────────────────────────────
        default:
          "bg-[color:var(--chip-selected-bg)] text-[color:var(--chip-selected-fg)] border-[color:var(--chip-selected-border)]",
        secondary:
          "bg-[color:var(--chip-neutral-bg)] text-[color:var(--chip-neutral-fg)] border-[color:var(--chip-neutral-border)]",
        destructive:
          "bg-destructive/15 text-destructive border-destructive/30",
        outline:
          "bg-transparent text-foreground border-[color:var(--border)]",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
