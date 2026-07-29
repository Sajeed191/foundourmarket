/**
 * Flash Deal Intelligence (Revenue Intelligence Engine v1.0).
 *
 * Advisory only. This module NEVER starts, ends, reorders or edits a Flash
 * Deal — the rotation engine, eligibility pipeline and admin controls remain
 * the single source of truth. Every recommendation requires admin approval and
 * deep-links into the existing Flash Deals console.
 */
import type { Product } from "@/lib/products";
import type { FlashRecommendation, FlashRecommendationKind } from "./types";
import { listingConversion, rankIndex, rankProducts, unitPrice, velocityPerDay } from "./scoring";

const HORIZON_DAYS = 30;
/** Documented assumption: promoted listings sell faster than unpromoted ones. */
const PROMO_UPLIFT = 0.35;

function forecastRevenue(p: Product, uplift: number): number {
  return Math.round(velocityPerDay(p) * HORIZON_DAYS * unitPrice(p) * (1 + uplift));
}

/** 0–100 probability the current stock clears within the next 7 days. */
export function selloutProbability(p: Product): number | null {
  const v = velocityPerDay(p);
  if (v <= 0 || p.stockQuantity <= 0) return null;
  const daysToClear = p.stockQuantity / (v * (1 + PROMO_UPLIFT));
  if (daysToClear <= 2) return 95;
  if (daysToClear >= 30) return 5;
  return Math.round(Math.max(5, Math.min(95, (1 - (daysToClear - 2) / 28) * 90 + 5)));
}

function rec(
  kind: FlashRecommendationKind,
  p: Product,
  o: { title: string; reason: string; confidence: number; estimatedImpact: number; revenueForecast: number },
): FlashRecommendation {
  return {
    id: `${kind}:${p.slug}`,
    kind,
    title: o.title,
    reason: o.reason,
    subject: p.name,
    subjectImage: p.image || null,
    confidence: o.confidence,
    estimatedImpact: o.estimatedImpact,
    selloutProbability: selloutProbability(p),
    revenueForecast: o.revenueForecast,
    issue: {
      entity: "flash_deal",
      entityId: p.slug,
      module: "revenue-intelligence",
      action: o.title,
      text: o.reason,
    },
    requiresApproval: true,
  };
}

export function evaluateFlashDeals(products: Product[]): FlashRecommendation[] {
  const live = products.filter((p) => p.status === "published");
  if (live.length === 0) return [];

  const scores = rankIndex(rankProducts(live));
  const inFlash = live.filter((p) => p.flashDeal || p.hotDeal);
  const out: FlashRecommendation[] = [];

  const medianConv = (() => {
    const vals = live.map(listingConversion).filter((v): v is number => v != null).sort((a, b) => a - b);
    return vals.length ? vals[Math.floor(vals.length / 2)] : 0;
  })();

  // Should start — highest ranked in-stock products with no promotion.
  live
    .filter((p) => !p.flashDeal && !p.hotDeal && p.inStock && (scores.get(p.slug)?.score ?? 0) >= 68)
    .sort((a, b) => (scores.get(b.slug)?.score ?? 0) - (scores.get(a.slug)?.score ?? 0))
    .slice(0, 6)
    .forEach((p) => {
      const score = scores.get(p.slug)?.score ?? 0;
      out.push(
        rec("should_start", p, {
          title: "Recommended to add to Flash Deals",
          reason: `Ranks ${score}/100 on live demand with healthy stock and no promotion running.`,
          confidence: Math.min(90, 55 + Math.round(score / 4)),
          estimatedImpact: Math.round(velocityPerDay(p) * HORIZON_DAYS * unitPrice(p) * PROMO_UPLIFT),
          revenueForecast: forecastRevenue(p, PROMO_UPLIFT),
        }),
      );
    });

  for (const p of inFlash) {
    const conv = listingConversion(p);
    const score = scores.get(p.slug)?.score ?? 0;
    const forecast = forecastRevenue(p, 0);

    // Should end — out of stock, or converting far below the catalogue median.
    if (!p.inStock || p.stockQuantity <= 0) {
      out.push(
        rec("should_end", p, {
          title: "Recommended to end this Flash Deal",
          reason: "The product is out of stock, so the promotion is spending placement it cannot convert.",
          confidence: 92,
          estimatedImpact: 0,
          revenueForecast: 0,
        }),
      );
      continue;
    }
    if (conv != null && medianConv > 0 && conv <= medianConv * 0.5 && p.viewsCount >= 150) {
      out.push(
        rec("underperforming", p, {
          title: "Flash Deal is underperforming",
          reason: `Converting at ${conv.toFixed(1)}% against a ${medianConv.toFixed(1)}% median despite promoted placement.`,
          confidence: 70,
          estimatedImpact: -Math.round(forecast * 0.2),
          revenueForecast: forecast,
        }),
      );
      continue;
    }

    // Best performing + priority placement.
    if (score >= 72) {
      out.push(
        rec("best_performing", p, {
          title: "Top performing Flash Deal",
          reason: `Ranks ${score}/100 while promoted — protect this placement for the rest of the window.`,
          confidence: 85,
          estimatedImpact: Math.round(forecast * 0.1),
          revenueForecast: forecast,
        }),
      );
    }
  }

  // Priority placement — the single best promoted product to show first.
  const priority = inFlash
    .filter((p) => p.inStock)
    .sort((a, b) => (scores.get(b.slug)?.score ?? 0) - (scores.get(a.slug)?.score ?? 0))[0];
  if (priority) {
    out.unshift(
      rec("priority_placement", priority, {
        title: "Recommended first position in Flash Deals",
        reason: `Highest ranked live promotion at ${scores.get(priority.slug)?.score ?? 0}/100 — best candidate for the hero slot.`,
        confidence: 80,
        estimatedImpact: Math.round(forecastRevenue(priority, 0) * 0.08),
        revenueForecast: forecastRevenue(priority, 0),
      }),
    );
  }

  return out;
}

/** Total forecast revenue across everything currently promoted. */
export function flashRevenueForecast(products: Product[]): number {
  return products
    .filter((p) => p.status === "published" && (p.flashDeal || p.hotDeal))
    .reduce((sum, p) => sum + forecastRevenue(p, 0), 0);
}
