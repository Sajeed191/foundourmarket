import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Button — Premium UI System v4.0
 *
 * Three canonical variants:
 *   • primary   — orange gradient CTA (also the shadcn default alias)
 *   • secondary — dark surface with hairline border
 *   • ghost     — text only, subtle hover
 *
 * Legacy variant names (hero, ember, luxury, glass, outline, neon, link,
 * destructive) are preserved so no call site breaks. In development they
 * emit a one-time console warning so we can gradually migrate.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium cursor-pointer select-none transition-all duration-[var(--duration-normal)] ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-gradient-to-b from-[#ff9a3d] to-[#f57a1f] text-primary-foreground shadow-[0_1px_0_rgba(255,255,255,0.18)_inset,0_6px_18px_-8px_rgba(255,138,42,0.55)] hover:brightness-105 active:brightness-95",
        secondary:
          "bg-[color-mix(in_oklab,var(--card)_92%,white_2%)] text-foreground border border-[color:var(--border)] hover:bg-[color-mix(in_oklab,var(--card)_82%,white_6%)]",
        ghost:
          "bg-transparent text-foreground hover:bg-white/[0.04]",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        link:
          "bg-transparent text-primary underline-offset-4 hover:underline p-0 h-auto",
        // ── Deprecated aliases (kept for compatibility) ───────────────
        default:
          "bg-gradient-to-b from-[#ff9a3d] to-[#f57a1f] text-primary-foreground shadow-[0_1px_0_rgba(255,255,255,0.18)_inset,0_6px_18px_-8px_rgba(255,138,42,0.55)] hover:brightness-105 active:brightness-95",
        outline:
          "bg-[color-mix(in_oklab,var(--card)_92%,white_2%)] text-foreground border border-[color:var(--border)] hover:bg-[color-mix(in_oklab,var(--card)_82%,white_6%)]",
        hero:
          "bg-gradient-to-b from-[#ff9a3d] to-[#f57a1f] text-primary-foreground shadow-[0_1px_0_rgba(255,255,255,0.18)_inset,0_6px_18px_-8px_rgba(255,138,42,0.55)] hover:brightness-105 active:brightness-95",
        ember:
          "bg-gradient-to-b from-[#ff9a3d] to-[#f57a1f] text-primary-foreground shadow-[0_1px_0_rgba(255,255,255,0.18)_inset,0_6px_18px_-8px_rgba(255,138,42,0.55)] hover:brightness-105 active:brightness-95",
        luxury:
          "bg-gradient-to-b from-[#ff9a3d] to-[#f57a1f] text-primary-foreground shadow-[0_1px_0_rgba(255,255,255,0.18)_inset,0_6px_18px_-8px_rgba(255,138,42,0.55)] hover:brightness-105 active:brightness-95",
        glass:
          "bg-white/[0.04] text-foreground border border-white/[0.08] backdrop-blur-md hover:bg-white/[0.08]",
        neon:
          "bg-gradient-to-b from-[#ff9a3d] to-[#f57a1f] text-primary-foreground shadow-[0_1px_0_rgba(255,255,255,0.18)_inset,0_6px_18px_-8px_rgba(255,138,42,0.55)] hover:brightness-105 active:brightness-95",
      },
      size: {
        default: "h-11 px-5 text-sm rounded-[var(--radius-button)]",
        sm: "h-9 px-3.5 text-xs rounded-[12px]",
        lg: "h-12 px-6 text-sm rounded-[var(--radius-button)]",
        icon: "h-11 w-11 rounded-[var(--radius-button)]",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const DEPRECATED = new Set(["default", "outline", "hero", "ember", "luxury", "glass", "neon"]);
const warned = new Set<string>();

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    if (
      import.meta.env?.DEV &&
      typeof variant === "string" &&
      DEPRECATED.has(variant) &&
      !warned.has(variant)
    ) {
      warned.add(variant);
      // eslint-disable-next-line no-console
      console.warn(
        `[Button] variant="${variant}" is deprecated. Use "primary" | "secondary" | "ghost".`,
      );
    }
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
