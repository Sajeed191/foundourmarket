/**
 * Product Ranking Intelligence (Revenue Intelligence Engine v1.0).
 *
 * A deterministic, explainable 0–100 score for every published product,
 * composed from signals the platform already records. No new engine, no AI
 * call, no writes. Signals the platform does NOT record (cart additions,
 * per-product return rate) are reported as unavailable rather than invented —
 * the Zero Fake Intelligence rule applies here as everywhere else.
 */
import type { Product } from "@/lib/products";
import type { ProductRankScore, RankComponentId } from "./types";

/** Effective unit price used for every revenue estimate in this engine. */
export function unitPrice(p: Product): number {
  const v = p.priceInr ?? p.price ?? 0;
  return Number.isFinite(v) && v > 0 ? Number(v) : 0;
}

/** Estimated unit margin; falls back to a conservative share of price. */
export function unitMargin(p: Product): number {
  const price = unitPrice(p);
  const cost = p.costPriceInr ?? null;
  if (cost != null && cost > 0 && cost < price) return price - cost;
  return price * 0.25;
}

/** Sales per day since the listing was created (never negative). */
export function velocityPerDay(p: Product): number {
  const created = Date.parse(p.createdAt || "");
  const days = Number.isNaN(created)
    ? 30
    : Math.max(1, (Date.now() - created) / 86_400_000);
  return Math.max(0, p.soldCount / days);
}

/** Views → sales conversion for a listing, as a percentage. */
export function listingConversion(p: Product): number | null {
  if (p.viewsCount < 25) return null;
  return (p.soldCount / p.viewsCount) * 100;
}

function scale(value: number, best: number): number {
  if (best <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((value / best) * 100)));
}

const WEIGHTS: Record<RankComponentId, number> = {
  velocity: 0.28,
  conversion: 0.2,
  views: 0.12,
  wishlist: 0.1,
  inventory: 0.1,
  reviews: 0.12,
  confidence: 0.08,
};

/**
 * Signals the catalogue does not currently record per product. Listed on every
 * score so admins know exactly what the number is and is not based on.
 */
const UNAVAILABLE = ["Cart additions", "Per-product return rate"];

export type RankOptions = {
  /** Optional readiness score per slug (0–100) from Catalog Intelligence. */
  readiness?: Map<string, number>;
};

export function rankProducts(products: Product[], opts: RankOptions = {}): ProductRankScore[] {
  const live = products.filter((p) => p.status === "published");
  if (live.length === 0) return [];

  const maxVelocity = Math.max(...live.map(velocityPerDay), 0.001);
  const maxViews = Math.max(...live.map((p) => p.viewsCount), 1);
  const maxWishlist = Math.max(...live.map((p) => p.wishlistCount), 1);
  const maxConversion = Math.max(
    ...live.map((p) => listingConversion(p) ?? 0),
    0.001,
  );

  return live
    .map((p) => {
      const conversion = listingConversion(p);
      const stockRatio =
        p.lowStockThreshold > 0 ? p.stockQuantity / (p.lowStockThreshold * 4) : p.stockQuantity / 20;

      const components: Record<RankComponentId, number> = {
        velocity: scale(velocityPerDay(p), maxVelocity),
        conversion: conversion == null ? 0 : scale(conversion, maxConversion),
        views: scale(p.viewsCount, maxViews),
        wishlist: scale(p.wishlistCount, maxWishlist),
        inventory: p.inStock ? Math.max(0, Math.min(100, Math.round(stockRatio * 100))) : 0,
        reviews:
          p.reviews > 0
            ? Math.round(Math.min(100, (p.rating / 5) * 100 * Math.min(1, 0.5 + p.reviews / 40)))
            : 0,
        confidence: Math.round(opts.readiness?.get(p.slug) ?? 50),
      };

      const score = Math.round(
        (Object.keys(WEIGHTS) as RankComponentId[]).reduce(
          (sum, k) => sum + components[k] * WEIGHTS[k],
          0,
        ),
      );

      const placement: ProductRankScore["placement"] =
        score >= 78 ? "homepage_hero" : score >= 62 ? "featured_rail" : score >= 42 ? "category_rail" : "catalog_only";

      return {
        slug: p.slug,
        name: p.name,
        image: p.image || null,
        score,
        components,
        placement,
        revenueRunRate: Math.round(velocityPerDay(p) * 30 * unitPrice(p)),
        unavailable: UNAVAILABLE,
      } satisfies ProductRankScore;
    })
    .sort((a, b) => b.score - a.score);
}

/** Convenience lookup used by the opportunity, flash and alert detectors. */
export function rankIndex(scores: ProductRankScore[]): Map<string, ProductRankScore> {
  return new Map(scores.map((s) => [s.slug, s]));
}
