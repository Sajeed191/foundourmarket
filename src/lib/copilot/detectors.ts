/**
 * Copilot Detectors (v1.0).
 *
 * Pure, deterministic composition over PUBLIC data the platform already
 * produces (Products cache + Marketplace Health listings). No new scoring
 * engine, no AI calls, no writes, no schema access. Every insight is
 * explainable: reason + impact + confidence + one action.
 */
import type { Product } from "@/lib/products";
import type { MarketplaceHealthListing } from "@/lib/use-marketplace-health";
import type { VendorIntelligence } from "@/lib/marketplace-intelligence";
import type { CopilotInsight, CopilotSignalId, CopilotSeverity } from "./types";

type Ctx = {
  products: Product[];
  listings: MarketplaceHealthListing[];
  vendors: VendorIntelligence[];
};

const HOUR = 3600_000;

function published(p: Product) {
  return p.status === "published";
}

function make(
  signal: CopilotSignalId,
  kind: CopilotInsight["kind"],
  severity: CopilotSeverity,
  base: Omit<CopilotInsight, "id" | "signal" | "kind" | "severity" | "priority">,
): CopilotInsight {
  const weight = { critical: 400, high: 280, medium: 170, low: 90 }[severity];
  return {
    ...base,
    id: `${signal}:${base.issue.entityId ?? base.subject}`,
    signal,
    kind,
    severity,
    priority: weight + base.confidence,
  };
}

function hoursUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return (t - Date.now()) / HOUR;
}

/* ------------------------------ opportunities ----------------------------- */

export function detectOpportunities(ctx: Ctx): CopilotInsight[] {
  const out: CopilotInsight[] = [];
  const { products } = ctx;
  const live = products.filter(published);

  // 1. Best sellers with no promotion.
  const topSellers = [...live].sort((a, b) => b.soldCount - a.soldCount).slice(0, 12);
  for (const p of topSellers) {
    if (p.soldCount < 5) continue;
    if (p.flashDeal || p.hotDeal) continue;
    out.push(
      make("bestseller_not_promoted", "opportunity", "high", {
        title: "Best seller is not in Flash Deals",
        reason: `${p.name} has ${p.soldCount} sales but no promotional placement.`,
        impact: "Promoting a proven seller usually lifts units sold on the homepage rails.",
        confidence: 84,
        minutes: 2,
        action: "Add to Flash Deals",
        subject: p.name,
        subjectImage: p.image,
        issue: { entity: "product", entityId: p.slug, module: "merchandising", action: "Add to Flash Deals", text: "flash deal promotion" },
      }),
    );
  }

  // 2. High traffic, weak SEO.
  for (const p of live) {
    if (p.viewsCount < 100) continue;
    const weak = !p.seoTitle || !p.seoDescription || (p.metaKeywords?.length ?? 0) === 0;
    if (!weak) continue;
    out.push(
      make("traffic_without_seo", "opportunity", "high", {
        title: "High-traffic product with incomplete SEO",
        reason: `${p.name} gets ${p.viewsCount} views but is missing search metadata.`,
        impact: "Completing SEO metadata improves search visibility for a page already proving demand.",
        confidence: 90,
        minutes: 1,
        action: "Auto Fix SEO",
        subject: p.name,
        subjectImage: p.image,
        issue: { entity: "product", entityId: p.slug, module: "seo_intelligence", action: "Complete SEO metadata", text: "seo metadata title description keywords" },
      }),
    );
  }

  // 3. Weak imagery.
  for (const p of live) {
    if (p.image) continue;
    out.push(
      make("weak_imagery", "opportunity", "medium", {
        title: "Product is missing a main image",
        reason: `${p.name} is published without a primary image.`,
        impact: "Listings without imagery convert far below catalogue average.",
        confidence: 95,
        minutes: 5,
        action: "Open gallery",
        subject: p.name,
        issue: { entity: "product", entityId: p.slug, module: "image_quality", action: "Add product images", text: "image gallery upload" },
      }),
    );
  }

  // 4. Bundle candidates — strong sellers with no cross-sell links.
  for (const p of live) {
    if (p.soldCount < 3) continue;
    if ((p.crossSellProducts?.length ?? 0) > 0 || (p.relatedProducts?.length ?? 0) > 0) continue;
    out.push(
      make("bundle_candidate", "opportunity", "medium", {
        title: "Good candidate for a bundle",
        reason: `${p.name} sells well but has no cross-sell or bundle links.`,
        impact: "Bundled accessories typically raise average order value.",
        confidence: 70,
        minutes: 4,
        action: "Review relationships",
        subject: p.name,
        subjectImage: p.image,
        issue: { entity: "product", entityId: p.slug, module: "relationship_intelligence", action: "Add cross-sell products", text: "cross-sell bundle relationships" },
      }),
    );
  }

  // 5. Trending without a promotion.
  for (const p of live) {
    if (!p.trending || p.flashDeal || p.hotDeal) continue;
    out.push(
      make("trending_without_promotion", "opportunity", "medium", {
        title: "Trending product has no promotion",
        reason: `${p.name} is flagged trending but carries no deal badge.`,
        impact: "Attaching a promotion to rising demand captures momentum while it lasts.",
        confidence: 76,
        minutes: 2,
        action: "Review promotion",
        subject: p.name,
        subjectImage: p.image,
        issue: { entity: "product", entityId: p.slug, module: "merchandising", action: "Add promotion", text: "flash deal promotion badge" },
      }),
    );
  }

  // 6. Vendors improving.
  for (const v of ctx.vendors) {
    if (v.tier !== "trusted" || v.score < 85) continue;
    out.push(
      make("vendor_improving", "opportunity", "low", {
        title: "Vendor is performing strongly",
        reason: `${v.vendorName} holds a ${v.score}/100 quality score across their listings.`,
        impact: "Strong vendors are the safest place to expand catalogue depth.",
        confidence: 72,
        minutes: 3,
        action: "Open vendor",
        subject: v.vendorName,
        issue: { entity: "vendor", entityId: v.vendorId, module: "vendor_intelligence", action: "Review vendor", text: "vendor performance" },
      }),
    );
  }

  // 7. Homepage-feature ready listings.
  for (const l of ctx.listings) {
    if (l.readiness.score < 88) continue;
    const p = products.find((x) => x.slug === l.productSlug);
    if (!p || !published(p) || p.homepageHero || p.featured) continue;
    out.push(
      make("homepage_feature_ready", "opportunity", "low", {
        title: "Ready for a homepage feature",
        reason: `${l.productName} scores ${l.readiness.score}/100 on marketplace readiness.`,
        impact: "Featuring complete listings improves first impressions and click-through.",
        confidence: 74,
        minutes: 2,
        action: "Review placement",
        subject: l.productName,
        subjectImage: l.productImage,
        issue: { entity: "product", entityId: l.productSlug, module: "merchandising", action: "Feature on homepage", text: "homepage placement feature" },
      }),
    );
  }

  return out;
}

/* --------------------------------- risks --------------------------------- */

export function detectRisks(ctx: Ctx): CopilotInsight[] {
  const out: CopilotInsight[] = [];
  const live = ctx.products.filter(published);

  // 1. Flash Deal / feature ending soon.
  for (const p of live) {
    const h = hoursUntil(p.featuredUntil) ?? hoursUntil(p.scheduledExpiryAt);
    if (h == null || h < 0 || h > 24) continue;
    out.push(
      make("flash_ending_soon", "risk", "high", {
        title: "Promotion ends within 24 hours",
        reason: `${p.name} loses its promotional window in about ${Math.max(1, Math.round(h))}h.`,
        impact: "Expiring deals leave homepage rails thinner unless extended or replaced.",
        confidence: 92,
        minutes: 2,
        action: "Review Flash Deals",
        subject: p.name,
        subjectImage: p.image,
        issue: { entity: "flash_deal", entityId: p.slug, module: "merchandising", action: "Review flash deal", text: "flash deal ending" },
      }),
    );
  }

  // 2. Inventory depletion.
  for (const p of live) {
    if (!p.inStock) continue;
    if (p.stockQuantity > Math.max(1, p.lowStockThreshold)) continue;
    const critical = p.soldCount >= 10;
    out.push(
      make("inventory_depletion", "risk", critical ? "critical" : "high", {
        title: critical ? "Low stock on a best seller" : "Stock running low",
        reason: `${p.name} has ${p.stockQuantity} units left (threshold ${p.lowStockThreshold}).`,
        impact: "Selling out removes a proven revenue source from the storefront.",
        confidence: 96,
        minutes: 3,
        action: "Open inventory",
        subject: p.name,
        subjectImage: p.image,
        issue: { entity: "product", entityId: p.slug, module: "inventory", action: "Restock", text: "inventory stock quantity" },
      }),
    );
  }

  // 3. Poor conversion.
  for (const p of live) {
    if (p.viewsCount < 250 || p.soldCount > 0) continue;
    out.push(
      make("poor_conversion", "risk", "medium", {
        title: "Traffic without sales",
        reason: `${p.name} has ${p.viewsCount} views and no recorded sales.`,
        impact: "Something on the page — price, imagery or copy — is blocking the purchase.",
        confidence: 78,
        minutes: 6,
        action: "Review listing",
        subject: p.name,
        subjectImage: p.image,
        issue: { entity: "product", entityId: p.slug, module: "product_completeness", action: "Review listing", text: "conversion listing quality" },
      }),
    );
  }

  // 4. Price anomalies.
  for (const p of live) {
    const price = p.priceInr ?? p.price;
    const compare = p.comparePriceInr ?? null;
    const badCompare = compare != null && compare > 0 && compare <= price;
    const extremeDiscount = (p.discount ?? 0) >= 80;
    if (!badCompare && !extremeDiscount) continue;
    out.push(
      make("price_anomaly", "risk", "high", {
        title: "Pricing looks inconsistent",
        reason: badCompare
          ? `${p.name} shows a compare-at price that is not higher than the selling price.`
          : `${p.name} shows a ${p.discount}% discount, which is unusually deep.`,
        impact: "Inconsistent pricing erodes trust and can misprice margin.",
        confidence: 88,
        minutes: 3,
        action: "Review pricing",
        subject: p.name,
        subjectImage: p.image,
        issue: { entity: "product", entityId: p.slug, module: "pricing_intelligence", action: "Review pricing", text: "pricing compare price margin" },
      }),
    );
  }

  // 5. Missing required data (readiness critical).
  for (const l of ctx.listings) {
    if (l.readiness.status !== "not_ready" && l.readiness.score >= 45) continue;
    out.push(
      make("missing_required_data", "risk", "high", {
        title: "Listing is missing required information",
        reason: `${l.productName} scores ${l.readiness.score}/100 — key fields are incomplete.`,
        impact: "Incomplete listings rank poorly and are filtered out of several storefront rails.",
        confidence: 90,
        minutes: 6,
        action: "Fix listing",
        subject: l.productName,
        subjectImage: l.productImage,
        issue: { entity: "product", entityId: l.productSlug, module: "product_completeness", action: "Complete listing", text: "missing required fields" },
      }),
    );
  }

  // 6. Duplicate listings (same normalised name).
  const byName = new Map<string, Product[]>();
  for (const p of live) {
    const key = p.name.trim().toLowerCase().replace(/\s+/g, " ");
    byName.set(key, [...(byName.get(key) ?? []), p]);
  }
  for (const [, group] of byName) {
    if (group.length < 2) continue;
    const p = group[0];
    out.push(
      make("duplicate_listing", "risk", "medium", {
        title: "Possible duplicate listing",
        reason: `${group.length} published products share the name "${p.name}".`,
        impact: "Duplicates split traffic and reviews between the same product.",
        confidence: 82,
        minutes: 5,
        action: "Review duplicates",
        subject: p.name,
        subjectImage: p.image,
        issue: { entity: "duplicate", entityId: p.slug, module: "duplicate_detection", action: "Review duplicates", text: "duplicate listing" },
      }),
    );
  }

  // 7. Declining vendor quality.
  for (const v of ctx.vendors) {
    if (v.tier !== "at_risk" && v.tier !== "watch") continue;
    out.push(
      make("vendor_declining", "risk", v.tier === "at_risk" ? "high" : "medium", {
        title: v.tier === "at_risk" ? "Vendor quality is at risk" : "Vendor quality needs watching",
        reason: `${v.vendorName} averages ${v.score}/100 across ${v.listingCount} listings.`,
        impact: "Weak vendor catalogues drag down category quality and customer trust.",
        confidence: 80,
        minutes: 8,
        action: "Open vendor",
        subject: v.vendorName,
        issue: { entity: "vendor", entityId: v.vendorId, module: "vendor_intelligence", action: "Review vendor", text: "vendor quality" },
      }),
    );
  }

  return out;
}

/* ------------------------------- predictions ------------------------------ */

export function detectPredictions(ctx: Ctx): CopilotInsight[] {
  const out: CopilotInsight[] = [];
  const live = ctx.products.filter(published);
  const now = Date.now();

  // 1. Likely to sell out.
  for (const p of live) {
    if (!p.inStock || p.soldCount < 5 || p.stockQuantity <= 0) continue;
    const ageDays = Math.max(7, (now - Date.parse(p.createdAt || "")) / 86_400_000 || 30);
    const perDay = p.soldCount / ageDays;
    if (perDay <= 0) continue;
    const days = Math.round(p.stockQuantity / perDay);
    if (days > 21) continue;
    out.push(
      make("predict_sellout", "prediction", days <= 7 ? "high" : "medium", {
        title: "Likely to sell out soon",
        reason: `${p.name} is selling about ${perDay.toFixed(1)} units/day with ${p.stockQuantity} in stock.`,
        impact: `Estimated stock-out in roughly ${days} day${days === 1 ? "" : "s"}.`,
        confidence: 68,
        minutes: 3,
        action: "Plan restock",
        estimate: true,
        subject: p.name,
        subjectImage: p.image,
        issue: { entity: "product", entityId: p.slug, module: "inventory", action: "Restock", text: "inventory stock" },
      }),
    );
  }

  // 2. Flash Deals likely to underperform.
  for (const p of live) {
    if (!p.flashDeal && !p.hotDeal) continue;
    if (p.viewsCount >= 60 || p.soldCount >= 2) continue;
    out.push(
      make("predict_flash_underperform", "prediction", "medium", {
        title: "Flash Deal may underperform",
        reason: `${p.name} is promoted but has only ${p.viewsCount} views and ${p.soldCount} sales so far.`,
        impact: "Estimate: this slot is likely to convert below the rail average.",
        confidence: 62,
        minutes: 3,
        action: "Review Flash Deal",
        estimate: true,
        subject: p.name,
        subjectImage: p.image,
        issue: { entity: "flash_deal", entityId: p.slug, module: "merchandising", action: "Review flash deal", text: "flash deal performance" },
      }),
    );
  }

  // 3. Vendors likely to miss targets.
  for (const v of ctx.vendors) {
    if (v.score >= 65) continue;
    out.push(
      make("predict_vendor_miss", "prediction", "medium", {
        title: "Vendor likely to miss quality targets",
        reason: `${v.vendorName} currently averages ${v.score}/100.`,
        impact: "Estimate: without listing fixes this vendor stays below the marketplace bar.",
        confidence: 60,
        minutes: 10,
        action: "Open vendor",
        estimate: true,
        subject: v.vendorName,
        issue: { entity: "vendor", entityId: v.vendorId, module: "vendor_intelligence", action: "Review vendor", text: "vendor performance" },
      }),
    );
  }

  // 4. Categories gaining momentum.
  const catStats = new Map<string, { sold: number; views: number; n: number }>();
  for (const p of live) {
    const key = p.category || "Uncategorised";
    const s = catStats.get(key) ?? { sold: 0, views: 0, n: 0 };
    s.sold += p.soldCount;
    s.views += p.viewsCount;
    s.n += 1;
    catStats.set(key, s);
  }
  const ranked = [...catStats.entries()]
    .filter(([, s]) => s.n >= 3 && s.views > 0)
    .sort((a, b) => b[1].sold / b[1].n - a[1].sold / a[1].n)
    .slice(0, 2);
  for (const [name, s] of ranked) {
    out.push(
      make("predict_category_momentum", "prediction", "low", {
        title: "Category gaining momentum",
        reason: `${name} averages ${(s.sold / s.n).toFixed(1)} sales per product across ${s.n} listings.`,
        impact: "Estimate: expanding this category is likely to compound existing demand.",
        confidence: 58,
        minutes: 5,
        action: "Open category",
        estimate: true,
        subject: name,
        issue: { entity: "category", entityId: name, module: "category_intelligence", action: "Review category", text: "category momentum" },
      }),
    );
  }

  // 5. Products likely to benefit from a promotion.
  for (const p of live) {
    if (p.flashDeal || p.hotDeal) continue;
    if (p.viewsCount < 120 || p.soldCount > 2 || !p.inStock) continue;
    out.push(
      make("predict_promotion_lift", "prediction", "medium", {
        title: "Likely to benefit from a promotion",
        reason: `${p.name} has ${p.viewsCount} views but only ${p.soldCount} sales.`,
        impact: "Estimate: interest exists — a discount or deal badge is the most likely unlock.",
        confidence: 64,
        minutes: 2,
        action: "Review promotion",
        estimate: true,
        subject: p.name,
        subjectImage: p.image,
        issue: { entity: "product", entityId: p.slug, module: "merchandising", action: "Add promotion", text: "promotion discount badge" },
      }),
    );
  }

  return out;
}
