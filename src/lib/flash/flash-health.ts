/**
 * Flash Deal health scoring + plain-language recommendations.
 *
 * Pure functions over data the platform already has (stock, discount, window,
 * events, badge state). No new intelligence engine, no model calls. Follows the
 * project AI UX rule: one traffic-light status, one plain sentence, one action.
 */
import type { Product } from "@/lib/products";

export type DealStatus = "active" | "scheduled" | "expired" | "paused" | "no_deal";

export type DealStats = {
  views: number;
  clicks: number;
  purchases: number;
  ctr: number;
  conversion: number;
};

export const EMPTY_STATS: DealStats = { views: 0, clicks: 0, purchases: 0, ctr: 0, conversion: 0 };

export type WarningKey =
  | "expired"
  | "inactive"
  | "out_of_stock"
  | "badge_missing"
  | "price_conflict"
  | "priority_conflict"
  | "hidden_by_rules"
  | "over_discount";

export const WARNING_LABEL: Record<WarningKey, string> = {
  expired: "Expired",
  inactive: "Paused",
  out_of_stock: "Out of stock",
  badge_missing: "Badge missing",
  price_conflict: "Price conflict",
  priority_conflict: "Priority conflict",
  hidden_by_rules: "Hidden by rules",
  over_discount: "Large discount",
};

export type HealthTone = "green" | "blue" | "amber" | "red";

export type DealHealth = {
  score: number;
  tone: HealthTone;
  /** One plain-language recommendation. */
  recommendation: string;
};

export type HealthInput = {
  product: Product;
  status: DealStatus;
  discountPct: number;
  msRemaining: number | null;
  stats: DealStats;
  hasBadge: boolean;
  warnings: WarningKey[];
};

export function scoreDeal(input: HealthInput): DealHealth {
  const { product, status, discountPct, msRemaining, stats, hasBadge, warnings } = input;
  let score = 100;

  // Availability
  const qty = product.stockQuantity ?? 0;
  if (qty <= 0) score -= 45;
  else if (qty <= 3) score -= 18;
  else if (qty <= 10) score -= 8;

  // Offer strength
  if (discountPct <= 0) score -= 20;
  else if (discountPct < 5) score -= 10;

  // Window
  if (status === "expired") score -= 40;
  else if (status === "paused") score -= 25;
  else if (msRemaining != null && msRemaining < 2 * 3600_000) score -= 12;

  // Visibility
  if (!hasBadge) score -= 25;
  if (warnings.includes("hidden_by_rules")) score -= 12;
  if (warnings.includes("price_conflict")) score -= 20;
  if (warnings.includes("priority_conflict")) score -= 8;

  // Performance (only judged once there is meaningful traffic)
  if (stats.views >= 50) {
    if (stats.ctr < 1) score -= 12;
    if (stats.purchases === 0) score -= 10;
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  const tone: HealthTone = score >= 80 ? "green" : score >= 60 ? "blue" : score >= 35 ? "amber" : "red";

  return { score, tone, recommendation: recommend(input, score) };
}

function recommend(i: HealthInput, score: number): string {
  const qty = i.product.stockQuantity ?? 0;
  if (i.warnings.includes("price_conflict")) return "Flash price is not below the regular price — lower it or remove the deal.";
  if (qty <= 0) return "Out of stock — restock or end this deal so the homepage stays honest.";
  if (!i.hasBadge) return "No flash badge assigned — assign one so it can appear on the homepage.";
  if (i.status === "expired") return "This deal has ended — extend the window or archive it.";
  if (i.status === "paused") return "Deal is paused — resume it to bring it back to the storefront.";
  if (qty <= 3) return "Stock almost depleted — only a few units left.";
  if (i.msRemaining != null && i.msRemaining < 2 * 3600_000) return "Deal expires in under 2 hours — extend it if it is performing.";
  if (i.warnings.includes("hidden_by_rules")) return "Eligible but beyond the homepage limit — raise priority or the Flash Deals limit.";
  if (i.discountPct <= 0) return "No discount set — add a flash price to make it compelling.";
  if (i.stats.views >= 50 && i.stats.ctr < 1) return "Plenty of views but few clicks — try increasing the discount by 5%.";
  if (i.stats.views >= 50 && i.stats.purchases === 0) return "Getting clicks but no sales — review price, images or delivery promise.";
  if (score >= 80) return "Performing well — no action needed.";
  return "Monitor for another few hours before changing anything.";
}

/** Why a product is (or is not) in the current rotation, in plain language. */
export function rotationReason(rank: number | null, cap: number): string {
  if (rank == null) return "Not eligible this window — no live flash badge, or the product is unavailable.";
  if (rank < cap) return `Visible now — ranked #${rank + 1} after the seeded rotation (limit ${cap}).`;
  return `Waiting — ranked #${rank + 1} after the seeded rotation, beyond the limit of ${cap}.`;
}
