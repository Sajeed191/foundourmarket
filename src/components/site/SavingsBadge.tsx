import { BadgePercent } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * SavingsBadge — the single reusable "money saved" component used everywhere
 * (PDP, cart, checkout, order summary, product cards, FBT, coupons, etc.).
 *
 * Design system rule: **savings are always emerald + BadgePercent**. The brand
 * orange (`--accent`) stays reserved for CTAs and promotional actions. Never
 * inline savings styling in a consumer — always render this component.
 *
 * Variants:
 * - `pill`   — compact rounded pill for tight spots (product cards, cart lines)
 * - `line`   — icon + text, no chrome, for inline metadata rows
 * - `inline` — text-only ("You save …"), stronger amount weight
 * - `row`    — full-width bordered highlight (order summary "Total savings")
 *
 * Accessibility: the icon is decorative; the label + amount are always paired
 * (never color-only). An `aria-label` composes the full sentence for AT users.
 */
type Variant = "pill" | "line" | "inline" | "row";
type Size = "sm" | "md" | "lg";

export function SavingsBadge({
  amount,
  label = "You save",
  variant = "pill",
  size = "sm",
  className,
  suffix,
}: {
  /** Pre-formatted savings string (region-aware). Component owns nothing about currency. */
  amount: string;
  label?: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  /** Optional trailing text (e.g. " (20% off)"). */
  suffix?: React.ReactNode;
}) {
  const iconSize =
    size === "lg" ? "size-4" : size === "md" ? "size-3.5" : "size-3";
  const textSize =
    size === "lg" ? "text-sm" : size === "md" ? "text-[13px]" : "text-xs";
  const ariaLabel = `${label} ${amount}`;

  if (variant === "row") {
    return (
      <div
        className={cn(
          "flex items-center justify-between gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3.5 py-2.5",
          className,
        )}
        role="status"
        aria-label={ariaLabel}
      >
        <span
          className={cn(
            "inline-flex min-w-0 items-center gap-1.5 font-medium text-emerald-400",
            textSize,
          )}
        >
          <BadgePercent className={cn(iconSize, "shrink-0")} aria-hidden />
          <span className="truncate">{label}</span>
        </span>
        <span
          className={cn(
            "shrink-0 font-mono font-semibold tabular-nums text-emerald-400",
            size === "lg" ? "text-base" : "text-sm",
          )}
        >
          {amount}
        </span>
      </div>
    );
  }

  if (variant === "inline") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 font-medium text-emerald-400 tabular-nums",
          textSize,
          className,
        )}
        aria-label={ariaLabel}
      >
        <BadgePercent className={cn(iconSize, "shrink-0")} aria-hidden />
        <span>
          {label} <span className="font-semibold">{amount}</span>
          {suffix}
        </span>
      </span>
    );
  }

  if (variant === "line") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 font-medium text-emerald-400 tabular-nums",
          textSize,
          className,
        )}
        aria-label={ariaLabel}
      >
        <BadgePercent className={cn(iconSize, "shrink-0")} aria-hidden />
        <span className="truncate">
          {label} {amount}
          {suffix}
        </span>
      </span>
    );
  }

  // pill (default)
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-emerald-500/12 px-2 py-0.5 font-semibold text-emerald-400 tabular-nums",
        size === "lg" ? "text-xs" : "text-[10px]",
        className,
      )}
      aria-label={ariaLabel}
    >
      <BadgePercent
        className={cn(size === "lg" ? "size-3.5" : "size-3", "shrink-0")}
        aria-hidden
      />
      <span className="truncate">
        {label} {amount}
        {suffix}
      </span>
    </span>
  );
}
