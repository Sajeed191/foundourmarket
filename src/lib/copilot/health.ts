/**
 * Copilot Health (v1.0).
 *
 * Composes the ONE marketplace health score (0–100) and its eight pillars from
 * existing intelligence outputs. It re-uses Marketplace Health v1.0 as the
 * source of truth for catalog / vendors / trust and derives the operational
 * pillars from the same public product contract the storefront reads.
 * No new scoring engine — composition only.
 */
import type { Product } from "@/lib/products";
import type { MarketplaceHealth } from "@/lib/marketplace-intelligence";
import type { CopilotHealth, HealthPillar } from "./types";

const HISTORY_KEY = "fom.copilot.health.history.v1";
const MAX_POINTS = 60;

function pct(n: number, d: number): number {
  if (d <= 0) return 100;
  return Math.round((n / d) * 100);
}

function statusOf(score: number): CopilotHealth["status"] {
  if (score >= 90) return "Healthy";
  if (score >= 75) return "Good";
  if (score >= 55) return "Needs attention";
  return "Critical";
}

export function buildCopilotHealth(input: {
  products: Product[];
  health: MarketplaceHealth | null;
}): CopilotHealth {
  const live = input.products.filter((p) => p.status === "published");
  const n = live.length;
  const h = input.health;

  const seoOk = live.filter((p) => p.seoTitle && p.seoDescription).length;
  const inventoryOk = live.filter((p) => !p.inStock || p.stockQuantity > p.lowStockThreshold).length;
  const pricingOk = live.filter((p) => {
    const price = p.priceInr ?? p.price;
    const compare = p.comparePriceInr;
    return price > 0 && (compare == null || compare > price) && (p.discount ?? 0) < 80;
  }).length;
  const promoted = live.filter((p) => p.flashDeal || p.hotDeal || p.trending || p.bestseller).length;
  const withImage = live.filter((p) => p.image).length;
  const reviewed = live.filter((p) => p.reviews > 0).length;

  // Promotions health peaks at ~25% of the catalogue carrying a promotion.
  const promoRatio = n ? promoted / n : 0;
  const promoScore = Math.round(Math.min(1, promoRatio / 0.25) * 100);

  const cxScore = n ? Math.round((pct(withImage, n) * 0.6 + pct(reviewed, n) * 0.4)) : 100;

  const pillars: HealthPillar[] = [
    {
      id: "catalog",
      label: "Catalog",
      score: h?.rollups.catalog.averageReadiness ?? 0,
      detail: `${h?.rollups.catalog.listingCount ?? n} listings analysed`,
      trend: h?.trends.readiness.direction ?? "unknown",
      delta: h?.trends.readiness.delta ?? 0,
    },
    {
      id: "seo",
      label: "SEO",
      score: pct(seoOk, n),
      detail: `${seoOk} of ${n} listings have complete metadata`,
      trend: "unknown",
      delta: 0,
    },
    {
      id: "inventory",
      label: "Inventory",
      score: pct(inventoryOk, n),
      detail: `${n - inventoryOk} listing${n - inventoryOk === 1 ? "" : "s"} at or below the low-stock threshold`,
      trend: "unknown",
      delta: 0,
    },
    {
      id: "pricing",
      label: "Pricing",
      score: pct(pricingOk, n),
      detail: `${n - pricingOk} listing${n - pricingOk === 1 ? "" : "s"} with inconsistent pricing`,
      trend: "unknown",
      delta: 0,
    },
    {
      id: "vendors",
      label: "Vendors",
      score: h?.rollups.vendors.averageScore ?? 0,
      detail: `${h?.rollups.vendors.total ?? 0} vendors · ${h?.rollups.vendors.atRiskCount ?? 0} at risk`,
      trend: h?.trends.vendorHealth.direction ?? "unknown",
      delta: h?.trends.vendorHealth.delta ?? 0,
    },
    {
      id: "promotions",
      label: "Promotions",
      score: promoScore,
      detail: `${promoted} of ${n} listings carry a promotional badge`,
      trend: "unknown",
      delta: 0,
    },
    {
      id: "customer_experience",
      label: "Customer Experience",
      score: cxScore,
      detail: `${withImage} with imagery · ${reviewed} with reviews`,
      trend: "unknown",
      delta: 0,
    },
    {
      id: "trust",
      label: "Trust",
      score: h?.rollups.trust.score ?? 0,
      detail: `${h?.rollups.trust.criticalRisks ?? 0} critical · ${h?.rollups.trust.warningRisks ?? 0} warnings`,
      trend: h?.trends.trust.direction ?? "unknown",
      delta: h?.trends.trust.delta ?? 0,
    },
  ];

  const score = Math.round(pillars.reduce((a, p) => a + p.score, 0) / pillars.length);

  return { score, status: statusOf(score), pillars, history: readHistory() };
}

/* --------------------------------- history -------------------------------- */

export function readHistory(): { at: number; score: number }[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as { at: number; score: number }[]) : [];
  } catch {
    return [];
  }
}

/** Records at most one point per hour so the trend line stays meaningful. */
export function recordHealthPoint(score: number) {
  if (typeof window === "undefined") return;
  const history = readHistory();
  const last = history[history.length - 1];
  if (last && Date.now() - last.at < 3600_000) return;
  const next = [...history, { at: Date.now(), score }].slice(-MAX_POINTS);
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
}
