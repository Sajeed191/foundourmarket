/**
 * Revenue Opportunity Detection (Revenue Intelligence Engine v1.0).
 *
 * Pure functions over data the platform already has. Every opportunity carries
 * a reason, an estimated 30-day gain, a confidence, the basis for the estimate
 * and a Smart Navigation deep link. Nothing here writes or acts.
 *
 * Estimate model: gains are always derived from the product's own observed
 * velocity and price, multiplied by a documented uplift assumption. Assumptions
 * are conservative and shown to the admin — never presented as certainty.
 */
import type { Product } from "@/lib/products";
import type { RevenueOpportunity, RevenueSeverity, RevenueSignalId } from "./types";
import { listingConversion, unitPrice, velocityPerDay, type RankOptions } from "./scoring";
import { rankProducts } from "./scoring";

/** Documented uplift assumptions, expressed as a multiplier on current sales. */
export const UPLIFT = {
  featured: 0.18,
  flash: 0.35,
  conversionFix: 0.25,
  bundle: 0.12,
  crossSell: 0.09,
  categoryPromo: 0.15,
} as const;

const HORIZON_DAYS = 30;

function gain(p: Product, uplift: number): number {
  return Math.round(velocityPerDay(p) * HORIZON_DAYS * unitPrice(p) * uplift);
}

function severityFor(amount: number, top: number): RevenueSeverity {
  if (top <= 0) return "low";
  const share = amount / top;
  if (share >= 0.6) return "critical";
  if (share >= 0.35) return "high";
  if (share >= 0.15) return "medium";
  return "low";
}

type Draft = Omit<RevenueOpportunity, "severity" | "priority">;

function draft(
  signal: RevenueSignalId,
  p: Product,
  o: {
    title: string;
    reason: string;
    estimatedGain: number;
    confidence: number;
    action: string;
    basis: string;
    focus?: string;
  },
): Draft {
  return {
    id: `${signal}:${p.slug}`,
    signal,
    title: o.title,
    reason: o.reason,
    estimatedGain: o.estimatedGain,
    confidence: o.confidence,
    action: o.action,
    subject: p.name,
    subjectImage: p.image || null,
    basis: o.basis,
    issue: {
      entity: "product",
      entityId: p.slug,
      module: "revenue-intelligence",
      action: o.action,
      text: o.reason,
      focus: o.focus,
    },
  };
}

export type DetectContext = {
  products: Product[];
  /** Category → revenue, from Executive Analytics. */
  categoryRevenue?: Map<string, number>;
  readiness?: RankOptions["readiness"];
};

export function detectRevenueOpportunities(ctx: DetectContext): RevenueOpportunity[] {
  const live = ctx.products.filter((p) => p.status === "published");
  if (live.length === 0) return [];

  const scores = rankProducts(live, { readiness: ctx.readiness });
  const byScore = new Map(scores.map((s) => [s.slug, s.score]));
  const drafts: Draft[] = [];

  const medianConversion = (() => {
    const vals = live.map(listingConversion).filter((v): v is number => v != null).sort((a, b) => a - b);
    return vals.length ? vals[Math.floor(vals.length / 2)] : 0;
  })();

  for (const p of live) {
    const score = byScore.get(p.slug) ?? 0;
    const conv = listingConversion(p);
    const velocity = velocityPerDay(p);

    // 1 — Best-selling product not featured anywhere.
    if (score >= 65 && !p.featured && !p.homepageHero && !p.bestseller) {
      drafts.push(
        draft("bestseller_not_featured", p, {
          title: "Top seller has no featured placement",
          reason: `Ranks ${score}/100 on live demand but is not featured, on the homepage, or badged as a bestseller.`,
          estimatedGain: gain(p, UPLIFT.featured),
          confidence: 82,
          action: "Add featured placement",
          basis: `${velocity.toFixed(2)} sales/day × 30 days × ${Math.round(UPLIFT.featured * 100)}% placement uplift.`,
          focus: "merchandising",
        }),
      );
    }

    // 2 — High-converting product with no Flash Deal.
    if (conv != null && medianConversion > 0 && conv >= medianConversion * 1.4 && !p.flashDeal && !p.hotDeal && p.inStock) {
      drafts.push(
        draft("converting_without_flash", p, {
          title: "High converter is missing from Flash Deals",
          reason: `Converts at ${conv.toFixed(1)}% versus a ${medianConversion.toFixed(1)}% catalogue median, with no flash or hot badge.`,
          estimatedGain: gain(p, UPLIFT.flash),
          confidence: 76,
          action: "Review for Flash Deals",
          basis: `Current velocity × 30 days × ${Math.round(UPLIFT.flash * 100)}% promotion uplift. Admin approval required.`,
          focus: "merchandising",
        }),
      );
    }

    // 3 — High traffic, poor conversion.
    if (p.viewsCount >= 200 && conv != null && medianConversion > 0 && conv <= medianConversion * 0.5) {
      const potential = Math.round(
        ((medianConversion - conv) / 100) * p.viewsCount * unitPrice(p) * UPLIFT.conversionFix,
      );
      drafts.push(
        draft("traffic_low_conversion", p, {
          title: "Traffic is arriving but not converting",
          reason: `${p.viewsCount.toLocaleString()} views converting at ${conv.toFixed(1)}%, well below the ${medianConversion.toFixed(1)}% median. Usually pricing, imagery or missing detail.`,
          estimatedGain: Math.max(potential, 0),
          confidence: 64,
          action: "Review listing quality",
          basis: `Views × conversion gap to median × price, discounted to ${Math.round(UPLIFT.conversionFix * 100)}% recovery.`,
          focus: "images",
        }),
      );
    }

    // 4 — Low stock on a bestseller.
    if (score >= 60 && p.inStock && p.stockQuantity > 0 && velocity > 0) {
      const daysLeft = p.stockQuantity / velocity;
      if (daysLeft <= 14) {
        drafts.push(
          draft("low_stock_bestseller", p, {
            title: "Bestseller will sell out soon",
            reason: `${p.stockQuantity} units left at ${velocity.toFixed(2)} sales/day — roughly ${Math.max(1, Math.round(daysLeft))} days of cover.`,
            estimatedGain: Math.round(Math.max(0, HORIZON_DAYS - daysLeft) * velocity * unitPrice(p)),
            confidence: 88,
            action: "Restock",
            basis: "Revenue at risk = days out of stock in the next 30 × current velocity × price.",
            focus: "inventory",
          }),
        );
      }
    }

    // 5 — Bundle candidate: strong seller with no bundle-forming relationships.
    if (score >= 55 && p.crossSellProducts.length === 0 && p.relatedProducts.length >= 2) {
      drafts.push(
        draft("bundle_candidate", p, {
          title: "Strong candidate for a bundle",
          reason: `Sells well and has ${p.relatedProducts.length} related products, but no bundle or cross-sell is configured.`,
          estimatedGain: gain(p, UPLIFT.bundle),
          confidence: 58,
          action: "Configure bundle",
          basis: `Velocity × 30 days × ${Math.round(UPLIFT.bundle * 100)}% attach-rate assumption.`,
          focus: "related",
        }),
      );
    }

    // 6 — Frequently bought together not surfaced.
    if (p.relatedProducts.length >= 1 && p.upsellProducts.length === 0 && p.soldCount >= 5) {
      drafts.push(
        draft("frequently_bought_together", p, {
          title: "Frequently bought together is not set up",
          reason: "Relationship Intelligence found companions for this product, but no upsell is configured on the listing.",
          estimatedGain: gain(p, UPLIFT.crossSell),
          confidence: 61,
          action: "Add upsell products",
          basis: `Velocity × 30 days × ${Math.round(UPLIFT.crossSell * 100)}% attach-rate assumption.`,
          focus: "related",
        }),
      );
    }

    // 7 — No cross-sell at all on a revenue-carrying listing.
    if (p.soldCount >= 3 && p.crossSellProducts.length === 0 && p.relatedProducts.length === 0) {
      drafts.push(
        draft("missing_cross_sell", p, {
          title: "No cross-sell on a selling product",
          reason: "This product generates orders but offers customers nothing else at the point of purchase.",
          estimatedGain: gain(p, UPLIFT.crossSell * 0.7),
          confidence: 52,
          action: "Add cross-sell products",
          basis: `Velocity × 30 days × ${Math.round(UPLIFT.crossSell * 70)}% conservative attach rate.`,
          focus: "related",
        }),
      );
    }
  }

  // 8 — Trending categories without any promotion running.
  const byCategory = new Map<string, Product[]>();
  for (const p of live) {
    const key = p.category || "Uncategorised";
    const list = byCategory.get(key) ?? [];
    list.push(p);
    byCategory.set(key, list);
  }
  for (const [category, items] of byCategory) {
    if (items.length < 3) continue;
    const trendingCount = items.filter((p) => p.trending).length;
    const promoted = items.some((p) => p.flashDeal || p.hotDeal);
    const revenue = ctx.categoryRevenue?.get(category.toLowerCase()) ?? 0;
    if (trendingCount >= 2 && !promoted) {
      const lead = [...items].sort((a, b) => b.soldCount - a.soldCount)[0];
      const est = Math.round(
        (revenue > 0 ? revenue : items.reduce((s, p) => s + velocityPerDay(p) * HORIZON_DAYS * unitPrice(p), 0)) *
          UPLIFT.categoryPromo,
      );
      drafts.push({
        id: `trending_category_no_promo:${category}`,
        signal: "trending_category_no_promo",
        title: `${category} is trending with no promotion`,
        reason: `${trendingCount} products in ${category} carry a trending badge, but the category has no flash or hot deal running.`,
        estimatedGain: est,
        confidence: 55,
        action: "Plan a category promotion",
        subject: category,
        subjectImage: lead?.image || null,
        basis: `Category 30-day revenue × ${Math.round(UPLIFT.categoryPromo * 100)}% promotion uplift.`,
        issue: {
          entity: "category",
          entityId: category,
          module: "revenue-intelligence",
          action: "Plan a category promotion",
          text: `${category} trending without promotion`,
        },
      });
    }
  }

  const top = Math.max(...drafts.map((d) => d.estimatedGain), 0);
  return drafts
    .map((d) => ({
      ...d,
      severity: severityFor(d.estimatedGain, top),
      priority: d.estimatedGain * (d.confidence / 100),
    }))
    .sort((a, b) => b.priority - a.priority);
}
