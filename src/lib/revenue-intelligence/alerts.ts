/**
 * Revenue Alerts (Revenue Intelligence Engine v1.0).
 *
 * Time-sensitive revenue risks, surfaced from existing signals only. Advisory:
 * every alert deep-links to the surface where an admin can act.
 */
import type { Product } from "@/lib/products";
import type { RevenueAlert } from "./types";
import { listingConversion, rankIndex, rankProducts, unitPrice, velocityPerDay } from "./scoring";

export type AlertInput = {
  products: Product[];
  /** Storefront conversion over the trailing window (%). */
  conversionRate: number;
  /** Storefront conversion baseline to compare against (%). */
  conversionBaseline?: number;
  /** Views over the trailing window, for spike detection. */
  views?: number;
  /** Orders over the trailing window. */
  orders?: number;
};

export function detectRevenueAlerts(input: AlertInput): RevenueAlert[] {
  const live = input.products.filter((p) => p.status === "published");
  const scores = rankIndex(rankProducts(live));
  const out: RevenueAlert[] = [];

  for (const p of live) {
    const score = scores.get(p.slug)?.score ?? 0;
    const velocity = velocityPerDay(p);

    // Bestseller running out of stock.
    if (score >= 60 && velocity > 0 && p.stockQuantity > 0 && p.stockQuantity / velocity <= 5) {
      out.push({
        id: `bestseller_stock_low:${p.slug}`,
        signal: "bestseller_stock_low",
        severity: "critical",
        title: "Bestseller nearly out of stock",
        detail: `${p.stockQuantity} units left — about ${Math.max(1, Math.round(p.stockQuantity / velocity))} days at current demand.`,
        subject: p.name,
        issue: { entity: "product", entityId: p.slug, module: "revenue-intelligence", action: "Restock", focus: "inventory" },
      });
    }

    // Promoted product that is out of stock — placement is being wasted.
    if ((p.flashDeal || p.hotDeal) && (!p.inStock || p.stockQuantity <= 0)) {
      out.push({
        id: `vendor_out_of_stock:${p.slug}`,
        signal: "vendor_out_of_stock",
        severity: "high",
        title: "Promoted product is out of stock",
        detail: "A live promotion is pointing at a product customers cannot buy.",
        subject: p.name,
        issue: { entity: "flash_deal", entityId: p.slug, module: "revenue-intelligence", action: "Review promotion" },
      });
    }

    // Flash deal underperforming.
    const conv = listingConversion(p);
    if ((p.flashDeal || p.hotDeal) && conv != null && conv < 0.5 && p.viewsCount >= 200) {
      out.push({
        id: `flash_underperforming:${p.slug}`,
        signal: "flash_underperforming",
        severity: "medium",
        title: "Flash Deal is not converting",
        detail: `${p.viewsCount.toLocaleString()} views at ${conv.toFixed(2)}% conversion while promoted.`,
        subject: p.name,
        issue: { entity: "flash_deal", entityId: p.slug, module: "revenue-intelligence", action: "Review promotion" },
      });
    }

    // Traffic spike with no promotion attached.
    if (p.viewsCount >= 500 && p.soldCount <= 2 && !p.flashDeal && !p.hotDeal) {
      out.push({
        id: `traffic_spike:${p.slug}`,
        signal: "traffic_spike",
        severity: "medium",
        title: "High interest, almost no sales",
        detail: `${p.viewsCount.toLocaleString()} views have produced ${p.soldCount} orders. Worth reviewing price, imagery or availability.`,
        subject: p.name,
        issue: { entity: "product", entityId: p.slug, module: "revenue-intelligence", action: "Review listing", focus: "pricing" },
      });
    }
  }

  // Storefront-wide conversion drop.
  const baseline = input.conversionBaseline ?? 1.5;
  if (input.conversionRate > 0 && input.conversionRate < baseline * 0.6) {
    out.push({
      id: "conversion_drop:storefront",
      signal: "conversion_drop",
      severity: "high",
      title: "Storefront conversion is below baseline",
      detail: `Converting at ${input.conversionRate.toFixed(2)}% against a ${baseline.toFixed(2)}% baseline.`,
      issue: { entity: "unknown", module: "revenue-intelligence", action: "Review storefront", to: "/admin-traffic", label: "Traffic Intelligence" },
    });
  }

  // Abandonment proxy: strong wishlist demand that is not turning into orders.
  const wishlisted = live.filter((p) => p.wishlistCount >= 5 && p.soldCount === 0 && p.inStock);
  if (wishlisted.length >= 3) {
    const value = wishlisted.reduce((s, p) => s + p.wishlistCount * unitPrice(p), 0);
    out.push({
      id: "cart_abandonment:wishlist",
      signal: "cart_abandonment",
      severity: "medium",
      title: "Saved-for-later demand is not converting",
      detail: `${wishlisted.length} in-stock products are widely wishlisted but have no orders yet.`,
      subject: `${Math.round(value).toLocaleString()} in saved demand`,
      issue: { entity: "unknown", module: "revenue-intelligence", action: "Review wishlist demand", to: "/admin-marketing-automation", label: "Marketing automation" },
    });
  }

  const order = { critical: 0, high: 1, medium: 2, low: 3 } as const;
  return out.sort((a, b) => order[a.severity] - order[b.severity]).slice(0, 20);
}
