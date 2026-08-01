import { Link } from "@tanstack/react-router";
import { ArrowRight, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * FoundOurMarket™ — Premium CTA v1 (presentation only).
 *
 * One luxury button language for every section call-to-action:
 *   • `primary`   — Grab Deal / Shop Now (accent gradient pill, soft glow)
 *   • `secondary` — View All (outlined premium pill, hover fill)
 *   • `explore`   — Explore / Browse (filled glass, leading icon)
 *
 * Styling lives in `src/styles.css` (`.fom-cta*`) so all three themes are
 * token-driven. No routing, data or business logic here.
 */
export type PremiumCTAVariant = "primary" | "secondary" | "explore";

type BaseProps = {
  children: ReactNode;
  variant?: PremiumCTAVariant;
  /** Leading icon (Explore uses a compass/bag/sparkle). */
  icon?: LucideIcon;
  /** Show the trailing arrow (default true). */
  arrow?: boolean;
  block?: boolean;
  className?: string;
  "aria-label"?: string;
};

function Inner({ children, icon: Icon, arrow = true }: Pick<BaseProps, "children" | "icon" | "arrow">) {
  return (
    <>
      {Icon ? <Icon className="fom-cta-lead size-[18px] shrink-0" aria-hidden /> : null}
      <span>{children}</span>
      {arrow ? <ArrowRight className="fom-cta-arrow size-[18px] shrink-0" aria-hidden /> : null}
    </>
  );
}

function ctaClass(variant: PremiumCTAVariant, block?: boolean, className?: string) {
  return cn(
    "fom-cta",
    variant === "primary" && "fom-cta-primary",
    variant === "secondary" && "fom-cta-secondary",
    variant === "explore" && "fom-cta-explore",
    block && "fom-cta-block",
    className,
  );
}

/** CTA that navigates. `to` is passed straight through to the router. */
export function PremiumCTALink({
  to,
  variant = "secondary",
  ...rest
}: BaseProps & { to: string }) {
  const { children, icon, arrow, block, className } = rest;
  return (
    <Link
      to={to as never}
      aria-label={rest["aria-label"]}
      className={ctaClass(variant, block, className)}
    >
      <Inner icon={icon} arrow={arrow}>{children}</Inner>
    </Link>
  );
}

/** Non-interactive CTA face used inside a larger clickable card. */
export function PremiumCTAFace({ variant = "primary", ...rest }: BaseProps) {
  const { children, icon, arrow, block, className } = rest;
  return (
    <span className={ctaClass(variant, block, className)}>
      <Inner icon={icon} arrow={arrow}>{children}</Inner>
    </span>
  );
}

/** Centered row wrapper providing the standard 24px CTA rhythm. */
export function PremiumCTARow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("fom-cta-row", className)}>{children}</div>;
}
