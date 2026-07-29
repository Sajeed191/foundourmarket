/**
 * useCopilot — Marketplace Operations Copilot (v1.0) orchestration hook.
 *
 * Composes existing public contracts into one snapshot:
 *   Products cache → detectors → learning-weighted ranking
 *   Marketplace Health v1.0 → health pillars
 *   Smart Queues → today's workload
 *
 * Read-only. Never writes to the database, never changes business rules.
 */
import { useEffect, useMemo, useState } from "react";
import { useProducts } from "@/lib/use-products";
import { useMarketplaceHealth } from "@/lib/use-marketplace-health";
import { detectOpportunities, detectRisks, detectPredictions } from "./detectors";
import { buildCopilotHealth, recordHealthPoint } from "./health";
import { confidenceAdjustment, readLearning, signalWeight, subscribeLearning } from "./learning";
import type { CopilotInsight, CopilotSnapshot } from "./types";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Working late";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function applyLearning(items: CopilotInsight[], map = readLearning()): CopilotInsight[] {
  return items
    .map((i) => ({
      ...i,
      confidence: Math.max(35, Math.min(99, i.confidence + confidenceAdjustment(i.signal, map))),
      priority: Math.round(i.priority * signalWeight(i.signal, map)),
    }))
    .sort((a, b) => b.priority - a.priority);
}

export type CopilotBundle = {
  snapshot: CopilotSnapshot | null;
  loading: boolean;
  /** Insights the admin dismissed in this session. */
  dismiss: (id: string) => void;
  dismissed: Set<string>;
};

export function useCopilot(): CopilotBundle {
  const { products, loading: productsLoading } = useProducts();
  const bundle = useMarketplaceHealth();
  const [learningTick, setLearningTick] = useState(0);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());

  useEffect(() => subscribeLearning(() => setLearningTick((t) => t + 1)), []);

  const snapshot = useMemo<CopilotSnapshot | null>(() => {
    if (productsLoading || bundle.loading || products.length === 0) return null;
    void learningTick;

    const ctx = { products, listings: bundle.listings, vendors: bundle.vendors };
    const map = readLearning();

    const opportunities = applyLearning(detectOpportunities(ctx), map).filter((i) => !dismissed.has(i.id));
    const risks = applyLearning(detectRisks(ctx), map).filter((i) => !dismissed.has(i.id));
    const predictions = applyLearning(detectPredictions(ctx), map).filter((i) => !dismissed.has(i.id));

    const health = buildCopilotHealth({ products, health: bundle.health });
    const criticalCount = risks.filter((r) => r.severity === "critical").length;

    const primary = [...risks, ...opportunities].sort((a, b) => b.priority - a.priority)[0] ?? null;

    const priorities: string[] = [];
    const endingSoon = risks.filter((r) => r.signal === "flash_ending_soon").length;
    const lowStock = risks.filter((r) => r.signal === "inventory_depletion").length;
    const seoGaps = opportunities.filter((o) => o.signal === "traffic_without_seo").length;
    const missingImages = opportunities.filter((o) => o.signal === "weak_imagery").length;
    const revenue = opportunities.filter((o) => o.signal === "bestseller_not_promoted").length;

    if (endingSoon) priorities.push(`${endingSoon} promotion${endingSoon === 1 ? "" : "s"} ending today`);
    if (missingImages) priorities.push(`${missingImages} product${missingImages === 1 ? "" : "s"} missing images`);
    if (seoGaps) priorities.push(`${seoGaps} SEO issue${seoGaps === 1 ? "" : "s"} on high-traffic pages`);
    if (lowStock) priorities.push(`${lowStock} low-stock listing${lowStock === 1 ? "" : "s"}`);
    if (revenue) priorities.push("Revenue opportunity detected");
    if (!criticalCount) priorities.push("No critical alerts");

    return {
      version: 1,
      brief: {
        greeting: greeting(),
        statusLine: `Marketplace status: ${health.status}`,
        priorities: priorities.slice(0, 6),
        primary,
        criticalCount,
      },
      opportunities,
      risks,
      predictions,
      health,
      generatedAt: new Date().toISOString(),
      explainable: true,
    };
  }, [products, productsLoading, bundle.listings, bundle.vendors, bundle.health, bundle.loading, learningTick, dismissed]);

  useEffect(() => {
    if (snapshot) recordHealthPoint(snapshot.health.score);
  }, [snapshot?.health.score]);

  return {
    snapshot,
    loading: productsLoading || bundle.loading,
    dismissed,
    dismiss: (id: string) => setDismissed((prev) => new Set(prev).add(id)),
  };
}
