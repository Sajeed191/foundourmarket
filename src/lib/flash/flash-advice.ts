/**
 * Flash Deals v7.0 — per-deal advice derivation.
 *
 * Pure, read-only and presentational: it reads the existing DealEntry +
 * DealIntelligence contracts and returns plain-language recommendations with
 * an expected impact, a confidence level and an action descriptor. It never
 * mutates anything — the admin page maps an approved action onto the existing
 * Supabase mutations.
 */
import type { DealEntry } from "@/lib/flash/use-flash-admin";
import type { DealIntelligence } from "@/lib/flash/flash-intelligence";

export type AdviceAction =
  | { kind: "discount"; deltaPct: number }
  | { kind: "priority"; delta: number }
  | { kind: "shift"; hours: number }
  | { kind: "tomorrow" }
  | { kind: "evening" }
  | { kind: "edit" };

export type AdviceConfidence = "high" | "medium" | "low";

export type DealAdvice = {
  id: string;
  title: string;
  why: string;
  impact: string;
  confidence: AdviceConfidence;
  action: AdviceAction;
  actionLabel: string;
};

export type AdviceContext = {
  avgCtr: number;
  maxDiscountPct: number;
  categoryShare: number;
  brandShare: number;
  rotationStreak: number;
  cap: number;
};

const HOUR = 3600_000;

/** Ordered, deduplicated advice for one deal. Most valuable first. */
export function dealAdvice(e: DealEntry, ctx: AdviceContext): DealAdvice[] {
  const out: DealAdvice[] = [];
  const p = e.product;
  const qty = p.stockQuantity ?? 0;
  const hours = e.msRemaining != null ? e.msRemaining / HOUR : null;
  const startHour = e.deal ? new Date(e.deal.start_at).getHours() : null;

  const add = (a: DealAdvice) => {
    if (!out.some((x) => x.id === a.id)) out.push(a);
  };

  if (e.discountPct > 0 && e.discountPct < 15 && qty > 50) {
    add({
      id: "increase-discount",
      title: "Increase the discount by 5%",
      why: `Only ${e.discountPct}% off with ${qty} units in stock — shoppers rarely stop for shallow flash pricing.`,
      impact: "Typically +10-18% click-through",
      confidence: qty > 150 ? "high" : "medium",
      action: { kind: "discount", deltaPct: 5 },
      actionLabel: "+5% off",
    });
  }

  if (e.discountPct > ctx.maxDiscountPct) {
    add({
      id: "reduce-discount",
      title: "Reduce the discount by 5%",
      why: `${e.discountPct}% is above your ${ctx.maxDiscountPct}% guardrail, so margin is at risk.`,
      impact: "Protects margin, minimal demand loss",
      confidence: "high",
      action: { kind: "discount", deltaPct: -5 },
      actionLabel: "-5% off",
    });
  }

  if (qty > 0 && qty <= 5) {
    add({
      id: "restock",
      title: "Restock or end early",
      why: `Only ${qty} left — the deal will sell out and waste homepage space.`,
      impact: "Avoids a dead homepage slot",
      confidence: "high",
      action: { kind: "edit" },
      actionLabel: "Review deal",
    });
  }

  if (e.stats.views >= 50 && e.stats.ctr < ctx.avgCtr * 0.6) {
    add({
      id: "low-ctr",
      title: "Low click-through detected",
      why: `${e.stats.ctr.toFixed(1)}% CTR against a ${ctx.avgCtr.toFixed(1)}% average across your deals.`,
      impact: "A deeper cut usually recovers most of the gap",
      confidence: e.stats.views >= 200 ? "high" : "medium",
      action: { kind: "discount", deltaPct: 5 },
      actionLabel: "+5% off",
    });
  }

  if (startHour != null && startHour < 9 && e.status === "scheduled") {
    add({
      id: "move-evening",
      title: "Move to the evening peak",
      why: `This deal starts at ${startHour}:00, well before your busiest shopping hours.`,
      impact: "Evening windows see the most traffic",
      confidence: "medium",
      action: { kind: "evening" },
      actionLabel: "Move to 19:00",
    });
  }

  if (hours != null && hours < 2 && qty > 10) {
    add({
      id: "move-tomorrow",
      title: "Re-run this deal tomorrow",
      why: "It ends within two hours but still has healthy stock.",
      impact: "Recovers a full day of exposure",
      confidence: "medium",
      action: { kind: "tomorrow" },
      actionLabel: "Shift +24h",
    });
  }

  if (e.deal && ctx.rotationStreak === 0 && (e.rotationRank ?? 99) >= ctx.cap) {
    add({
      id: "increase-priority",
      title: "Raise priority for visibility",
      why: "This deal sits outside the visible homepage slots in the current rotation.",
      impact: "Moves it into the featured set sooner",
      confidence: "medium",
      action: { kind: "priority", delta: 1 },
      actionLabel: "Priority +1",
    });
  }

  if (ctx.rotationStreak >= 3) {
    add({
      id: "decrease-priority",
      title: "Lower priority to refresh the band",
      why: `Featured ${ctx.rotationStreak} rotations in a row — repeat exposure fatigues shoppers.`,
      impact: "Improves homepage freshness score",
      confidence: "medium",
      action: { kind: "priority", delta: -1 },
      actionLabel: "Priority -1",
    });
  }

  if (!p.image) {
    add({
      id: "hero-image",
      title: "Add a strong hero image",
      why: "This product has no lead image, so the flash card renders a placeholder.",
      impact: "Hero cards with imagery convert far better",
      confidence: "high",
      action: { kind: "edit" },
      actionLabel: "Open deal",
    });
  }

  if (ctx.categoryShare > 0.5) {
    add({
      id: "category-share",
      title: "Category is overrepresented",
      why: `${Math.round(ctx.categoryShare * 100)}% of visible slots are ${p.category || "this category"}.`,
      impact: "Balancing lifts overall homepage score",
      confidence: "medium",
      action: { kind: "priority", delta: -1 },
      actionLabel: "Priority -1",
    });
  }

  if (ctx.brandShare > 0.5) {
    add({
      id: "brand-share",
      title: "Brand is overrepresented",
      why: `${Math.round(ctx.brandShare * 100)}% of visible slots are ${p.brand || "this brand"}.`,
      impact: "More brand variety keeps the band interesting",
      confidence: "low",
      action: { kind: "priority", delta: -1 },
      actionLabel: "Priority -1",
    });
  }

  if (p.name.length > 60) {
    add({
      id: "long-title",
      title: "Product title is too long",
      why: `${p.name.length} characters — mobile flash cards truncate after roughly 60.`,
      impact: "Clearer titles improve mobile tap rate",
      confidence: "medium",
      action: { kind: "edit" },
      actionLabel: "Open deal",
    });
  }

  return out;
}

/** Health verdict shown on every deal, derived from the existing score. */
export type HealthVerdict = {
  label: "Excellent" | "Good" | "Needs improvement" | "Critical";
  tone: "green" | "blue" | "amber" | "red";
  score: number;
};

export function healthVerdict(intel: DealIntelligence | null | undefined, e: DealEntry): HealthVerdict {
  const score = intel?.score ?? e.health?.score ?? 0;
  if (score >= 80) return { label: "Excellent", tone: "green", score };
  if (score >= 65) return { label: "Good", tone: "blue", score };
  if (score >= 45) return { label: "Needs improvement", tone: "amber", score };
  return { label: "Critical", tone: "red", score };
}

export const HEALTH_TONE_CLASS: Record<HealthVerdict["tone"], string> = {
  green: "border-emerald-500/35 bg-emerald-500/10 text-emerald-300",
  blue: "border-sky-500/35 bg-sky-500/10 text-sky-300",
  amber: "border-amber-500/35 bg-amber-500/10 text-amber-200",
  red: "border-destructive/35 bg-destructive/10 text-destructive",
};

/** Countdown intelligence — colour bands only, driven by the real clock. */
export type CountdownPhase = "normal" | "today" | "hour" | "final" | "expired";

export function countdownPhase(msRemaining: number | null, expired: boolean): CountdownPhase {
  if (expired) return "expired";
  if (msRemaining == null) return "normal";
  if (msRemaining <= 0) return "expired";
  if (msRemaining < 10 * 60_000) return "final";
  if (msRemaining < HOUR) return "hour";
  if (msRemaining < 24 * HOUR) return "today";
  return "normal";
}

export const COUNTDOWN_CLASS: Record<CountdownPhase, string> = {
  normal: "text-muted-foreground",
  today: "text-sky-300",
  hour: "text-amber-300",
  final: "text-destructive animate-pulse",
  expired: "text-muted-foreground/60 line-through",
};
