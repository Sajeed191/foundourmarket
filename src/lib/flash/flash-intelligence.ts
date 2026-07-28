/**
 * Flash Deals Intelligence v5.0 — pure, explainable merchandising analysis.
 *
 * Everything here is a recommendation. Nothing in this module writes to the
 * database, changes a product, a badge, a price, a schedule or a priority:
 * it reads the data the platform already has and returns plain-language advice
 * that an administrator must approve. Every output carries its own "why".
 */
import type { Product } from "@/lib/products";
import type { DealEntry } from "@/lib/flash/use-flash-admin";
import type { HealthTone } from "@/lib/flash/flash-health";

/* ------------------------------------------------------------------ score */

export type ScoreDimension = {
  key: string;
  label: string;
  /** 0–100 for this dimension. */
  value: number;
  weight: number;
  detail: string;
};

export type Grade = "Excellent" | "Good" | "Fair" | "Needs attention";

export type DealIntelligence = {
  score: number;
  grade: Grade;
  tone: HealthTone;
  dimensions: ScoreDimension[];
  /** Exactly one prioritized recommendation. */
  recommendation: string;
  /** Bullet reasons behind the score — the "Why?" disclosure. */
  reasons: string[];
};

export type ScoreContext = {
  avgCtr: number;
  avgConversion: number;
  /** 0–1 share of homepage slots taken by this product's category. */
  categoryShare: number;
  cap: number;
  maxDiscountPct: number;
  /** Consecutive rotation windows this product stays in the visible set. */
  rotationStreak: number;
};

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function intelligenceScore(e: DealEntry, ctx: ScoreContext): DealIntelligence {
  const p = e.product;
  const qty = p.stockQuantity ?? 0;

  const discount =
    e.discountPct <= 0 ? 10 :
    e.discountPct > ctx.maxDiscountPct ? 55 :
    e.discountPct >= 30 ? 100 :
    e.discountPct >= 15 ? 85 : 65;

  const stock =
    qty <= 0 ? 0 :
    qty <= 3 ? 30 :
    qty <= (p.lowStockThreshold || 10) ? 60 :
    qty > 200 ? 80 : 100;

  const hours = e.msRemaining != null ? e.msRemaining / 3600_000 : null;
  const time =
    e.status === "expired" ? 0 :
    e.status === "paused" ? 25 :
    e.status === "scheduled" ? 75 :
    hours == null ? 60 :
    hours < 2 ? 35 : hours < 8 ? 65 : hours > 336 ? 70 : 100;

  const ctr = e.stats.views < 25 ? 60 : clamp((e.stats.ctr / Math.max(0.5, ctx.avgCtr || 2)) * 60);
  const conversion =
    e.stats.views < 25 ? 60 : clamp((e.stats.conversion / Math.max(0.2, ctx.avgConversion || 1)) * 60);
  const revenue = clamp(Math.log10(1 + e.stats.purchases * e.dealPrice) * 25);
  const velocity = clamp(Math.log10(1 + (p.soldCount ?? 0)) * 45);
  const engagement = clamp(Math.log10(1 + (p.viewsCount ?? 0) + (p.wishlistCount ?? 0) * 5) * 30);
  const freshness = clamp(100 - ctx.rotationStreak * 22);
  const balance = clamp(100 - Math.max(0, ctx.categoryShare - 0.4) * 250);

  const dimensions: ScoreDimension[] = [
    { key: "discount", label: "Discount attractiveness", value: discount, weight: 1.4, detail: `${e.discountPct}% off` },
    { key: "stock", label: "Stock health", value: stock, weight: 1.3, detail: `${qty} in stock` },
    { key: "time", label: "Time remaining", value: time, weight: 1.1, detail: hours == null ? e.status : `${Math.round(hours)}h left` },
    { key: "ctr", label: "Click-through rate", value: ctr, weight: 1.2, detail: `${e.stats.ctr.toFixed(1)}% vs ${ctx.avgCtr.toFixed(1)}% average` },
    { key: "conversion", label: "Conversion rate", value: conversion, weight: 1.4, detail: `${e.stats.conversion.toFixed(1)}% vs ${ctx.avgConversion.toFixed(1)}% average` },
    { key: "revenue", label: "Revenue", value: revenue, weight: 1.1, detail: `${Math.round(e.stats.purchases * e.dealPrice).toLocaleString()} earned` },
    { key: "velocity", label: "Sales velocity", value: velocity, weight: 0.9, detail: `${p.soldCount ?? 0} lifetime sales` },
    { key: "engagement", label: "Customer engagement", value: engagement, weight: 0.8, detail: `${p.viewsCount ?? 0} views · ${p.wishlistCount ?? 0} wishlists` },
    { key: "freshness", label: "Rotation freshness", value: freshness, weight: 0.9, detail: ctx.rotationStreak > 0 ? `Featured ${ctx.rotationStreak} window${ctx.rotationStreak === 1 ? "" : "s"} in a row` : "Not currently featured" },
    { key: "balance", label: "Category balance", value: balance, weight: 0.7, detail: `${Math.round(ctx.categoryShare * 100)}% of homepage slots are ${p.category}` },
  ];

  const totalWeight = dimensions.reduce((a, d) => a + d.weight, 0);
  let score = dimensions.reduce((a, d) => a + d.value * d.weight, 0) / totalWeight;

  // Hard blockers cap the score no matter how good everything else looks.
  if (!e.hasBadge) score = Math.min(score, 55);
  if (e.warnings.includes("price_conflict")) score = Math.min(score, 35);
  if (qty <= 0) score = Math.min(score, 30);
  if (e.status === "expired") score = Math.min(score, 25);

  const final = clamp(score);
  const grade: Grade = final >= 80 ? "Excellent" : final >= 65 ? "Good" : final >= 45 ? "Fair" : "Needs attention";
  const tone: HealthTone = final >= 80 ? "green" : final >= 65 ? "blue" : final >= 45 ? "amber" : "red";

  const reasons = dimensions
    .slice()
    .sort((a, b) => b.value * b.weight - a.value * a.weight)
    .slice(0, 3)
    .map((d) => `${d.label}: ${d.detail}`);
  const weakest = dimensions.slice().sort((a, b) => a.value * a.weight - b.value * b.weight)[0];
  if (weakest) reasons.push(`Weakest signal — ${weakest.label.toLowerCase()} (${weakest.detail})`);

  return { score: final, grade, tone, dimensions, recommendation: singleRecommendation(e, ctx, final), reasons };
}

/** One prioritized, plain-language action. Never a list. */
function singleRecommendation(e: DealEntry, ctx: ScoreContext, score: number): string {
  const qty = e.product.stockQuantity ?? 0;
  const hours = e.msRemaining != null ? e.msRemaining / 3600_000 : null;

  if (e.warnings.includes("price_conflict")) return "Lower the flash price below the regular price, or remove this deal.";
  if (qty <= 0) return "End this deal early — the product is sold out.";
  if (!e.hasBadge && e.deal) return "Assign the flash badge so this deal can reach the homepage.";
  if (e.hasBadge && !e.deal) return "Add a flash price and schedule so this badge becomes a real offer.";
  if (e.status === "expired") return "Extend this deal for another 24 hours, or archive it.";
  if (e.status === "paused") return "Resume this deal to bring it back to the storefront.";
  if (qty <= 3) return "Stock is critical — prepare a replacement deal before it sells out.";
  if (hours != null && hours < 2) return "Expires in under 2 hours — extend it or line up a replacement.";
  if (e.discountPct > ctx.maxDiscountPct) return `Discount exceeds your ${ctx.maxDiscountPct}% guardrail — review the margin.`;
  if (e.stats.views >= 50 && e.stats.ctr < ctx.avgCtr * 0.6) return "Below-average clicks — try a deeper discount or a stronger lead image.";
  if (e.stats.views >= 50 && e.stats.conversion < ctx.avgConversion * 0.5 && e.stats.ctr > ctx.avgCtr)
    return "High interest but low conversion — consider reducing the price slightly.";
  if (ctx.rotationStreak >= 3) return "Shown for several rotations in a row — rotate in a fresh product.";
  if (ctx.categoryShare > 0.5) return "This category dominates the homepage today — balance it with another category.";
  if (qty > 200 && e.discountPct < 15) return "Plenty of inventory — a deeper discount would move more units.";
  if (score >= 80) return "Performing well — extend this deal for another 24 hours.";
  return "Keep monitoring — no change recommended for now.";
}

/* --------------------------------------------------- product recommendations */

export type ProductRecommendation = {
  product: Product;
  score: number;
  reasons: string[];
};

export function recommendProducts(
  products: Product[],
  entries: DealEntry[],
  opts: { campaignLabel: string | null; underCategories: string[]; limit?: number },
): ProductRecommendation[] {
  const featured = new Set(entries.map((e) => e.product.slug));
  const now = Date.now();

  return products
    .filter((p) => p.status === "published" && p.inStock && p.stockQuantity > 0 && !featured.has(p.slug))
    .map((p) => {
      const reasons: string[] = [];
      let score = 0;

      if (p.stockQuantity > 100) { score += 22; reasons.push("High inventory available"); }
      else if (p.stockQuantity > 30) { score += 10; reasons.push("Healthy stock levels"); }

      const margin = p.costPriceInr != null ? p.price - p.costPriceInr : null;
      if (margin != null && p.price > 0 && margin / p.price > 0.35) { score += 20; reasons.push("High margin — room to discount"); }

      if ((p.soldCount ?? 0) > 5) { score += 18; reasons.push("Selling steadily"); }
      if ((p.wishlistCount ?? 0) > 3) { score += 16; reasons.push("Frequently wishlisted"); }
      if ((p.viewsCount ?? 0) > 150) { score += 14; reasons.push("Frequently viewed"); }
      if ((p.rating ?? 0) >= 4.3 && (p.reviews ?? 0) >= 3) { score += 14; reasons.push("Excellent customer ratings"); }
      if (!featured.has(p.slug)) { score += 8; reasons.push("Never featured in Flash Deals"); }

      const ageDays = (now - new Date(p.createdAt).getTime()) / 86400_000;
      if (ageDays <= 30) { score += 10; reasons.push("Recently launched"); }
      if (ageDays > 120 && (p.soldCount ?? 0) < 3) { score += 8; reasons.push("Excluded from the homepage for a long time"); }

      if (opts.underCategories.includes(p.category)) { score += 18; reasons.push(`${p.category} is underrepresented today`); }
      if (opts.campaignLabel && p.category && opts.campaignLabel.toLowerCase().includes(p.category.toLowerCase())) {
        score += 12; reasons.push(`${opts.campaignLabel} campaign is active`);
      }
      if (p.image) { score += 4; reasons.push("Has a hero-quality lead image"); }

      return { product: p, score, reasons: reasons.slice(0, 4) };
    })
    .filter((r) => r.reasons.length > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.limit ?? 8);
}

/* ----------------------------------------------------------------- conflicts */

export type ConflictSeverity = "critical" | "warning" | "info";
export type ConflictFix =
  | { kind: "assign_badge"; slug: string }
  | { kind: "create_deal"; slug: string }
  | { kind: "end_deal"; entryKey: string }
  | { kind: "extend_deal"; entryKey: string }
  | { kind: "clear_priority"; entryKey: string }
  | { kind: "review"; entryKey: string };

export type Conflict = {
  id: string;
  severity: ConflictSeverity;
  title: string;
  detail: string;
  fix?: ConflictFix;
  fixLabel?: string;
};

export function detectConflicts(
  entries: DealEntry[],
  opts: { maxDiscountPct: number; categoryShare: Map<string, number>; cap: number; rotationStreaks: Map<string, number> },
): Conflict[] {
  const out: Conflict[] = [];

  for (const e of entries) {
    const name = e.product.name;
    if (e.hasBadge && !e.deal) {
      out.push({ id: `badge-no-deal-${e.key}`, severity: "warning", title: "Badge without a flash deal", detail: `${name} carries a flash badge but has no price or schedule.`, fix: { kind: "create_deal", slug: e.product.slug }, fixLabel: "Create deal" });
    }
    if (e.deal && !e.hasBadge) {
      out.push({ id: `deal-no-badge-${e.key}`, severity: "warning", title: "Flash deal without a badge", detail: `${name} has a deal but no flash badge, so it cannot appear on the homepage.`, fix: { kind: "assign_badge", slug: e.product.slug }, fixLabel: "Assign badge" });
    }
    if (e.warnings.includes("priority_conflict")) {
      out.push({ id: `prio-${e.key}`, severity: "warning", title: "Priority conflict", detail: `${name} shares priority ${e.deal?.priority} with another active deal, so hero order is ambiguous.`, fix: { kind: "clear_priority", entryKey: e.key }, fixLabel: "Clear priority" });
    }
    if (e.status === "expired") {
      out.push({ id: `exp-${e.key}`, severity: "info", title: "Expired deal", detail: `${name} ended on ${new Date(e.deal!.end_at).toLocaleString()}.`, fix: { kind: "extend_deal", entryKey: e.key }, fixLabel: "Extend 24h" });
    }
    if ((e.product.stockQuantity ?? 0) <= 0 && e.status === "active") {
      out.push({ id: `oos-${e.key}`, severity: "critical", title: "Out-of-stock deal is live", detail: `${name} is sold out but still featured.`, fix: { kind: "end_deal", entryKey: e.key }, fixLabel: "End deal" });
    } else if ((e.product.stockQuantity ?? 0) <= 3 && e.status === "active") {
      out.push({ id: `low-${e.key}`, severity: "warning", title: "Very low stock", detail: `${name} has only ${e.product.stockQuantity} unit(s) left.`, fix: { kind: "review", entryKey: e.key }, fixLabel: "Review" });
    }
    if (e.discountPct > opts.maxDiscountPct) {
      out.push({ id: `disc-${e.key}`, severity: "warning", title: "Discount exceeds guardrail", detail: `${name} is ${e.discountPct}% off — above your ${opts.maxDiscountPct}% limit.`, fix: { kind: "review", entryKey: e.key }, fixLabel: "Review" });
    }
    const streak = opts.rotationStreaks.get(e.product.slug) ?? 0;
    if (streak >= 3) {
      out.push({ id: `stale-${e.key}`, severity: "info", title: "Appearing too frequently", detail: `${name} stays visible for ${streak} rotation windows in a row.`, fix: { kind: "review", entryKey: e.key }, fixLabel: "Review" });
    }
  }

  // Duplicate campaign labels across simultaneously-active deals.
  const byCampaign = new Map<string, number>();
  for (const e of entries) {
    if (!e.campaign || e.status !== "active") continue;
    byCampaign.set(e.campaign, (byCampaign.get(e.campaign) ?? 0) + 1);
  }
  for (const [label, count] of byCampaign) {
    if (count > 4) {
      out.push({ id: `campaign-${label}`, severity: "info", title: "Campaign is crowded", detail: `${count} live deals share the “${label}” campaign — consider splitting them across days.` });
    }
  }

  for (const [cat, share] of opts.categoryShare) {
    if (share > 0.5) {
      out.push({ id: `cat-${cat}`, severity: "warning", title: "Category imbalance", detail: `${Math.round(share * 100)}% of homepage slots are ${cat}. Feature another category for variety.` });
    }
  }

  const heroReady = entries.some(
    (e) => e.status === "active" && e.discountPct >= 15 && (e.product.stockQuantity ?? 0) > 5 && !!e.product.image,
  );
  if (!heroReady) {
    out.push({ id: "no-hero", severity: "critical", title: "No hero-quality product", detail: "No live deal has a strong discount, healthy stock and a lead image. The hero slot will look weak." });
  }

  const order: Record<ConflictSeverity, number> = { critical: 0, warning: 1, info: 2 };
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}

/* ------------------------------------------------------------------ coverage */

export type CoverageRow = { label: string; shown: number; waiting: number; share: number };

export function coverageBy(
  entries: DealEntry[],
  visibleSlugs: Set<string>,
  pick: (e: DealEntry) => string,
): CoverageRow[] {
  const map = new Map<string, { shown: number; waiting: number }>();
  for (const e of entries) {
    const key = pick(e) || "Unspecified";
    const cur = map.get(key) ?? { shown: 0, waiting: 0 };
    if (visibleSlugs.has(e.product.slug)) cur.shown++;
    else cur.waiting++;
    map.set(key, cur);
  }
  const totalShown = Math.max(1, [...map.values()].reduce((a, v) => a + v.shown, 0));
  return [...map.entries()]
    .map(([label, v]) => ({ label, shown: v.shown, waiting: v.waiting, share: v.shown / totalShown }))
    .sort((a, b) => b.shown - a.shown || b.waiting - a.waiting);
}

/* ------------------------------------------------------------- hero optimizer */

export type HeroSuggestion = {
  current: DealEntry | null;
  suggested: DealEntry | null;
  reasons: string[];
  shouldReplace: boolean;
};

export function heroOptimizer(
  entries: DealEntry[],
  visibleOrder: string[],
  scores: Map<string, DealIntelligence>,
): HeroSuggestion {
  const bySlug = new Map(entries.map((e) => [e.product.slug, e]));
  const current = visibleOrder.length ? bySlug.get(visibleOrder[0]) ?? null : null;

  const candidates = entries
    .filter((e) => e.status === "active" && (e.product.stockQuantity ?? 0) > 0 && !!e.product.image)
    .sort((a, b) => (scores.get(b.key)?.score ?? 0) - (scores.get(a.key)?.score ?? 0));

  const suggested = candidates[0] ?? null;
  if (!suggested) return { current, suggested: null, reasons: ["No live deal currently qualifies as a hero."], shouldReplace: false };

  const s = scores.get(suggested.key);
  const reasons = [
    `Flash Score ${s?.score ?? 0}/100 — the highest of all live deals`,
    `${suggested.discountPct}% off with ${suggested.product.stockQuantity} units in stock`,
    suggested.stats.views > 0 ? `${suggested.stats.ctr.toFixed(1)}% click-through, ${suggested.stats.conversion.toFixed(1)}% conversion` : "Fresh to the homepage — no fatigue yet",
    "Has a hero-quality lead image",
  ];

  const currentScore = current ? scores.get(current.key)?.score ?? 0 : 0;
  const shouldReplace = !!current && current.key !== suggested.key && (s?.score ?? 0) - currentScore >= 12;

  return { current, suggested, reasons, shouldReplace };
}

/* --------------------------------------------------------- smart scheduling */

export function schedulingWarnings(entries: DealEntry[], now: number): Conflict[] {
  const out: Conflict[] = [];
  const day = 86400_000;
  const withDeal = entries.filter((e) => e.deal);

  const startingSoon = withDeal.filter((e) => {
    const s = new Date(e.deal!.start_at).getTime();
    return s > now && s < now + day;
  });
  if (startingSoon.length > 5)
    out.push({ id: "burst-start", severity: "warning", title: "Too many deals start together", detail: `${startingSoon.length} deals begin within 24 hours — stagger them so the homepage refreshes gradually.` });

  const endingToday = withDeal.filter((e) => {
    const t = new Date(e.deal!.end_at).getTime();
    return t > now && t < now + day;
  });
  if (endingToday.length > 4)
    out.push({ id: "burst-end", severity: "warning", title: "Too many deals expire together", detail: `${endingToday.length} deals end within 24 hours — the homepage could empty out at once.` });

  const tomorrowActive = withDeal.some((e) => {
    const s = new Date(e.deal!.start_at).getTime();
    const t = new Date(e.deal!.end_at).getTime();
    return e.deal!.active && s <= now + day && t >= now + day;
  });
  if (!tomorrowActive)
    out.push({ id: "empty-tomorrow", severity: "critical", title: "No Flash Deals tomorrow", detail: "Nothing is scheduled to be live 24 hours from now. Schedule a deal or extend an existing one." });

  // Overlapping campaigns of the same label.
  const spans = new Map<string, { start: number; end: number }[]>();
  for (const e of withDeal) {
    if (!e.campaign) continue;
    const list = spans.get(e.campaign) ?? [];
    list.push({ start: new Date(e.deal!.start_at).getTime(), end: new Date(e.deal!.end_at).getTime() });
    spans.set(e.campaign, list);
  }
  const labels = [...spans.keys()];
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      const a = spans.get(labels[i])!;
      const b = spans.get(labels[j])!;
      const overlap = a.some((x) => b.some((y) => x.start < y.end && y.start < x.end));
      if (overlap)
        out.push({ id: `overlap-${labels[i]}-${labels[j]}`, severity: "info", title: "Campaigns overlap", detail: `“${labels[i]}” and “${labels[j]}” run at the same time — customers may see mixed messaging.` });
    }
  }

  return out;
}

/* ------------------------------------------------------- homepage quality */

export type HomepageQuality = {
  score: number;
  tone: HealthTone;
  activeCount: number;
  avgDiscount: number;
  avgFlashScore: number;
  categoryDiversity: number;
  brandDiversity: number;
  stockHealth: number;
  endingToday: number;
  upcomingExpirations: number;
  freshness: number;
  duplicatesPrevented: boolean;
  summary: string;
};

export function homepageQuality(
  visible: DealEntry[],
  scores: Map<string, DealIntelligence>,
  cap: number,
  now: number,
): HomepageQuality {
  const n = visible.length;
  const avgDiscount = n ? visible.reduce((a, e) => a + e.discountPct, 0) / n : 0;
  const avgFlashScore = n ? visible.reduce((a, e) => a + (scores.get(e.key)?.score ?? 0), 0) / n : 0;
  const cats = new Set(visible.map((e) => e.product.category).filter(Boolean));
  const brands = new Set(visible.map((e) => e.product.brand ?? "Unbranded"));
  const categoryDiversity = n ? cats.size / n : 0;
  const brandDiversity = n ? brands.size / n : 0;
  const healthyStock = visible.filter((e) => (e.product.stockQuantity ?? 0) > 5).length;
  const stockHealth = n ? healthyStock / n : 0;
  const endingToday = visible.filter((e) => e.deal && new Date(e.deal.end_at).getTime() < now + 86400_000).length;
  const upcomingExpirations = visible.filter((e) => e.deal && new Date(e.deal.end_at).getTime() < now + 3 * 86400_000).length;
  const newest = visible.reduce((a, e) => Math.max(a, e.deal ? new Date(e.deal.created_at).getTime() : 0), 0);
  const freshness = newest ? Math.max(0, 1 - (now - newest) / (7 * 86400_000)) : 0;

  const fill = Math.min(1, n / Math.max(1, cap));
  const score = Math.round(
    (fill * 25) + (Math.min(1, avgFlashScore / 100) * 25) + (categoryDiversity * 15) +
    (brandDiversity * 10) + (stockHealth * 15) + (freshness * 10),
  );
  const tone: HealthTone = score >= 80 ? "green" : score >= 60 ? "blue" : score >= 40 ? "amber" : "red";

  const summary =
    n === 0 ? "The homepage has no live Flash Deals right now — publish one to fill the band." :
    n < cap ? `Only ${n} of ${cap} homepage slots are filled — add ${cap - n} more deal(s).` :
    stockHealth < 0.6 ? "Several featured products are low on stock — prepare replacements." :
    categoryDiversity < 0.5 ? "Featured products lean heavily on a few categories — add variety." :
    avgFlashScore < 60 ? "Featured deals are underperforming — refresh the weakest one." :
    "Homepage looks strong — no action needed.";

  return {
    score, tone, activeCount: n, avgDiscount, avgFlashScore, categoryDiversity, brandDiversity,
    stockHealth, endingToday, upcomingExpirations, freshness, duplicatesPrevented: true, summary,
  };
}

/* --------------------------------------------------------------- assistant */

export type AssistantInsight = {
  id: string;
  tone: HealthTone;
  message: string;
  why: string[];
  entryKey?: string;
};

export function assistantInsights(
  entries: DealEntry[],
  scores: Map<string, DealIntelligence>,
  ctx: { visibleSlugs: Set<string>; rotationStreaks: Map<string, number>; categoryShare: Map<string, number>; avgCtr: number; avgConversion: number; now: number },
): AssistantInsight[] {
  const out: AssistantInsight[] = [];

  for (const e of entries) {
    const s = scores.get(e.key);
    if (!s) continue;
    const hours = e.msRemaining != null ? e.msRemaining / 3600_000 : null;

    if (e.status === "active" && e.stats.views >= 40 && e.stats.ctr > ctx.avgCtr * 1.2 && e.stats.conversion < ctx.avgConversion * 0.6) {
      out.push({ id: `ctr-${e.key}`, tone: "amber", entryKey: e.key,
        message: `${e.product.name} has a very high click-through rate but low conversion. Consider reducing the price slightly.`,
        why: [`CTR ${e.stats.ctr.toFixed(1)}% vs ${ctx.avgCtr.toFixed(1)}% average`, `Conversion ${e.stats.conversion.toFixed(1)}% vs ${ctx.avgConversion.toFixed(1)}% average`] });
    }
    if (e.status === "active" && hours != null && hours < 2) {
      out.push({ id: `exp-${e.key}`, tone: "red", entryKey: e.key,
        message: `${e.product.name} expires in under 2 hours. Prepare a replacement.`,
        why: [`Ends ${new Date(e.deal!.end_at).toLocaleString()}`, `${e.stats.purchases} purchases so far`] });
    }
    const streak = ctx.rotationStreaks.get(e.product.slug) ?? 0;
    if (streak >= 3 && ctx.visibleSlugs.has(e.product.slug)) {
      out.push({ id: `fatigue-${e.key}`, tone: "blue", entryKey: e.key,
        message: `${e.product.name} has been featured for ${streak} rotations in a row. Rotate in something fresh.`,
        why: ["Rotation freshness is the weakest dimension for this deal", "Repeat exposure reduces click-through over time"] });
    }
  }

  for (const [cat, share] of ctx.categoryShare) {
    if (share > 0.5)
      out.push({ id: `cat-${cat}`, tone: "amber", message: `${cat} is over-represented on the homepage today.`, why: [`${Math.round(share * 100)}% of visible slots`, "A balanced homepage converts across more customer intents"] });
  }

  if (out.length === 0)
    out.push({ id: "all-good", tone: "green", message: "Everything looks healthy — no changes recommended right now.", why: ["No expiring, out-of-stock or underperforming deals detected"] });

  const rank: Record<HealthTone, number> = { red: 0, amber: 1, blue: 2, green: 3 };
  return out.sort((a, b) => rank[a.tone] - rank[b.tone]).slice(0, 6);
}

/* --------------------------------------------------------------- timeline */

export type TimelineStage = { label: string; value: number; suffix?: string };

export function dealTimeline(e: DealEntry): TimelineStage[] {
  return [
    { label: "Published", value: e.deal ? 1 : 0 },
    { label: "Homepage featured", value: e.rotationRank != null ? 1 : 0 },
    { label: "Views", value: e.stats.views },
    { label: "Clicks", value: e.stats.clicks },
    { label: "Wishlists", value: e.product.wishlistCount ?? 0 },
    { label: "Purchases", value: e.stats.purchases },
    { label: "Revenue", value: Math.round(e.stats.purchases * e.dealPrice) },
  ];
}
