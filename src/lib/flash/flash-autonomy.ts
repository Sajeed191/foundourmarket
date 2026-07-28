/**
 * Flash Deals v9.0 — Autonomous Merchandising Engine (pure derivations).
 *
 * Everything in this module is read-only maths over the existing contracts
 * (`DealEntry`, `DealIntelligence`, `DealAdvice`, `Conflict`). It never writes
 * to the database, never touches rotation, countdown, realtime or analytics
 * logic: it only turns data the platform already has into a briefing, a ranked
 * queue, comparison rows, inventory verdicts and a what-if simulation.
 */
import type { DealEntry } from "@/lib/flash/use-flash-admin";
import type { DealIntelligence, Conflict } from "@/lib/flash/flash-intelligence";
import type { DealAdvice, AdviceConfidence } from "@/lib/flash/flash-advice";

const HOUR = 3600_000;

/* ------------------------------------------------------------- 1. briefing */

export type Briefing = {
  live: number;
  endingSoon: number;
  attention: number;
  revenuePotential: number;
  /** Estimated revenue uplift, in %, if every high-confidence tip is applied. */
  upliftPct: number;
  /** One plain-language paragraph summarising the whole page. */
  sentence: string;
  tone: "green" | "blue" | "amber" | "red";
};

export function morningBriefing(
  entries: DealEntry[],
  conflicts: Conflict[],
  advice: Map<string, DealAdvice[]>,
  now: number,
): Briefing {
  const live = entries.filter((e) => e.status === "active").length;
  const endingSoon = entries.filter(
    (e) => e.msRemaining != null && e.msRemaining > 0 && e.msRemaining <= 2 * HOUR,
  ).length;
  const critical = conflicts.filter((c) => c.severity === "critical").length;
  const attention = conflicts.length;
  const revenuePotential = entries
    .filter((e) => e.status === "active")
    .reduce((a, e) => a + e.dealPrice * Math.max(0, e.product.stockQuantity ?? 0), 0);

  let tips = 0;
  for (const list of advice.values()) tips += list.filter((a) => a.confidence !== "low").length;
  const upliftPct = Math.min(45, Math.round(tips * 1.5 + critical * 2));

  const tone: Briefing["tone"] =
    critical > 0 ? "red" : attention > 3 ? "amber" : live === 0 ? "blue" : "green";

  const parts: string[] = [];
  parts.push(live === 0 ? "No flash deals are live right now." : `${live} live deal${live === 1 ? "" : "s"} running.`);
  if (endingSoon > 0) parts.push(`${endingSoon} end${endingSoon === 1 ? "s" : ""} within 2 hours.`);
  if (attention > 0) parts.push(`${attention} need${attention === 1 ? "s" : ""} attention${critical ? ` (${critical} critical)` : ""}.`);
  if (upliftPct > 0) parts.push(`Estimated revenue can increase by ${upliftPct}% by applying the suggested changes.`);
  if (attention === 0 && upliftPct === 0 && live > 0) parts.push("Everything looks healthy — nothing to fix.");

  void now;
  return { live, endingSoon, attention, revenuePotential, upliftPct, sentence: parts.join(" "), tone };
}

/* -------------------------------------------------------- 2. priority queue */

export type QueueUrgency = "now" | "today" | "soon";

export type QueueItem = {
  id: string;
  entryKey: string;
  productName: string;
  productImage: string | null;
  title: string;
  reason: string;
  impact: string;
  confidence: AdviceConfidence;
  urgency: QueueUrgency;
  /** 0–100 ranking weight used purely for ordering. */
  priority: number;
  revenueDelta: number;
  ctrDelta: number;
  inventoryNote: string;
  advice: DealAdvice;
};

const CONFIDENCE_WEIGHT: Record<AdviceConfidence, number> = { high: 1, medium: 0.7, low: 0.4 };

export function priorityQueue(
  entries: DealEntry[],
  advice: Map<string, DealAdvice[]>,
  scores: Map<string, DealIntelligence>,
  ignored: Set<string>,
): QueueItem[] {
  const out: QueueItem[] = [];
  for (const e of entries) {
    const list = advice.get(e.key) ?? [];
    const intel = scores.get(e.key);
    const qty = e.product.stockQuantity ?? 0;
    for (const a of list) {
      const id = `${e.key}:${a.id}`;
      if (ignored.has(id)) continue;
      const hours = e.msRemaining != null ? e.msRemaining / HOUR : null;
      const urgency: QueueUrgency =
        hours != null && hours <= 2 ? "now" : hours != null && hours <= 24 ? "today" : "soon";
      const gapFromPerfect = 100 - (intel?.score ?? 60);
      const conf = CONFIDENCE_WEIGHT[a.confidence];
      const revenueDelta = Math.round(e.dealPrice * Math.min(qty, 25) * (gapFromPerfect / 100) * conf * 0.35);
      const ctrDelta = Math.round(gapFromPerfect * conf * 0.12 * 10) / 10;
      const priority = Math.round(
        gapFromPerfect * 0.6 + conf * 25 + (urgency === "now" ? 20 : urgency === "today" ? 10 : 0),
      );
      out.push({
        id,
        entryKey: e.key,
        productName: e.product.name,
        productImage: e.product.image ?? null,
        title: a.title,
        reason: a.why,
        impact: a.impact,
        confidence: a.confidence,
        urgency,
        priority,
        revenueDelta,
        ctrDelta,
        inventoryNote: inventoryVerdict(e).label,
        advice: a,
      });
    }
  }
  return out.sort((x, y) => y.priority - x.priority);
}

/* --------------------------------------------------- 3. inventory protection */

export type InventoryTone = "green" | "blue" | "amber" | "red";

export type InventoryVerdict = {
  label: string;
  tone: InventoryTone;
  detail: string;
  /** Suggested change in promotion intensity. */
  suggestion: string;
};

export function inventoryVerdict(e: DealEntry): InventoryVerdict {
  const qty = e.product.stockQuantity ?? 0;
  const sold = e.product.soldCount ?? 0;
  const views = e.stats.views;

  if (qty <= 0) {
    return { label: "Out of stock", tone: "red", detail: "No units available.", suggestion: "Pause this deal until stock returns." };
  }
  if (qty <= 3) {
    return { label: "May sell out", tone: "red", detail: `${qty} unit${qty === 1 ? "" : "s"} left.`, suggestion: "Lower the promotion intensity or restock first." };
  }
  if (views > 200 && qty <= 15) {
    return { label: "High demand · low inventory", tone: "amber", detail: `${qty} left against ${views} views.`, suggestion: "Reduce the discount or shorten the window." };
  }
  if (qty <= (e.product.lowStockThreshold || 10)) {
    return { label: "Low inventory", tone: "amber", detail: `${qty} units remaining.`, suggestion: "Keep the discount modest to protect margin." };
  }
  if (qty > 200) {
    return { label: "Excess inventory", tone: "blue", detail: `${qty} units and ${sold} lifetime sales.`, suggestion: "Increase promotion intensity to clear stock." };
  }
  return { label: "Safe inventory", tone: "green", detail: `${qty} units available.`, suggestion: "Current promotion intensity is appropriate." };
}

/* --------------------------------------------------- 4. revenue simulation */

export type SimInput = {
  regularPrice: number;
  discountPct: number;
  durationHours: number;
  priority: number;
  /** Expected impressions across the whole window. */
  traffic: number;
  stock: number;
  baselineCtr: number;
  baselineConversion: number;
};

export type SimResult = {
  price: number;
  ctr: number;
  conversion: number;
  orders: number;
  revenue: number;
  remainingStock: number;
  sellThroughPct: number;
};

/**
 * Deliberately simple, transparent model: deeper discounts and higher priority
 * lift click-through, longer windows soften urgency, and orders are always
 * capped by real stock. Simulation only — nothing is written anywhere.
 */
export function simulateDeal(i: SimInput): SimResult {
  const price = Math.max(0, Math.round(i.regularPrice * (1 - i.discountPct / 100)));
  const discountLift = 1 + Math.min(1.8, i.discountPct / 35);
  const priorityLift = 1 + Math.min(0.4, i.priority / 250);
  const urgencyLift = i.durationHours <= 12 ? 1.2 : i.durationHours <= 48 ? 1.05 : 0.92;
  const ctr = Math.max(0, Math.min(35, i.baselineCtr * discountLift * priorityLift * urgencyLift));
  const conversion = Math.max(0, Math.min(25, i.baselineConversion * discountLift * urgencyLift));
  const rawOrders = (i.traffic * ctr) / 100 * (conversion / 100) * 10;
  const orders = Math.max(0, Math.min(i.stock, Math.round(rawOrders)));
  return {
    price,
    ctr: Math.round(ctr * 10) / 10,
    conversion: Math.round(conversion * 10) / 10,
    orders,
    revenue: orders * price,
    remainingStock: Math.max(0, i.stock - orders),
    sellThroughPct: i.stock > 0 ? Math.round((orders / i.stock) * 100) : 0,
  };
}

/* ------------------------------------------------------- 5. rotation heatmap */

export type HeatRow = {
  slug: string;
  name: string;
  image: string | null;
  currentSlot: number | null;
  nextSlot: number | null;
  visibilityPct: number;
  shownToday: number;
  skippedToday: number;
  /** Milliseconds until this product is expected to appear again. */
  nextAppearanceMs: number | null;
};

export type HeatWindow = { startsAt: number; slugs: string[] };

export function rotationHeatmap(
  windows: HeatWindow[],
  cap: number,
  meta: Map<string, { name: string; image: string | null }>,
  now: number,
): HeatRow[] {
  const slugs = new Set<string>();
  for (const w of windows) for (const s of w.slugs) slugs.add(s);

  const rows: HeatRow[] = [];
  for (const slug of slugs) {
    let shown = 0;
    let skipped = 0;
    let nextAppearance: number | null = null;
    let currentSlot: number | null = null;
    let nextSlot: number | null = null;

    windows.forEach((w, wi) => {
      const idx = w.slugs.indexOf(slug);
      const visible = idx >= 0 && idx < cap;
      if (visible) shown++;
      else skipped++;
      if (wi === 0) currentSlot = visible ? idx : null;
      if (wi === 1) nextSlot = visible ? idx : null;
      if (visible && nextAppearance == null && w.startsAt >= now) nextAppearance = w.startsAt - now;
    });

    rows.push({
      slug,
      name: meta.get(slug)?.name ?? slug,
      image: meta.get(slug)?.image ?? null,
      currentSlot,
      nextSlot,
      visibilityPct: windows.length ? Math.round((shown / windows.length) * 100) : 0,
      shownToday: shown,
      skippedToday: skipped,
      nextAppearanceMs: nextAppearance,
    });
  }
  return rows.sort((a, b) => b.visibilityPct - a.visibilityPct);
}

/* ------------------------------------------------------------ 6. comparison */

export type CompareRow = {
  key: string;
  name: string;
  image: string | null;
  ctr: number;
  revenue: number;
  conversion: number;
  discountPct: number;
  stock: number;
  views: number;
  health: number;
  flashScore: number;
};

export function compareRows(entries: DealEntry[], scores: Map<string, DealIntelligence>): CompareRow[] {
  return entries.map((e) => ({
    key: e.key,
    name: e.product.name,
    image: e.product.image ?? null,
    ctr: e.stats.ctr,
    revenue: e.stats.purchases * e.dealPrice,
    conversion: e.stats.conversion,
    discountPct: e.discountPct,
    stock: e.product.stockQuantity ?? 0,
    views: e.stats.views,
    health: e.health.score,
    flashScore: scores.get(e.key)?.score ?? 0,
  }));
}

/** The row that wins on revenue, then conversion, then flash score. */
export function compareWinner(rows: CompareRow[]): string | null {
  if (rows.length === 0) return null;
  return [...rows].sort(
    (a, b) => b.revenue - a.revenue || b.conversion - a.conversion || b.flashScore - a.flashScore,
  )[0]!.key;
}
