/**
 * Revenue Intelligence Engine (v1.0) — orchestration hook.
 *
 * Composes existing platform data into a single revenue snapshot:
 *  • Executive Analytics RPC  → revenue KPIs, categories, brands, top products
 *  • Products cache           → ranking, opportunities, flash evaluation
 *  • Traffic Intelligence     → conversion rate
 *  • Marketplace Health       → AI confidence + executive health score
 *
 * No schema changes, no new engines, no writes. Everything is advisory.
 */
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getExecutiveAnalyticsFn, type ExecutiveAnalytics } from "@/lib/executive-analytics.functions";
import { useProducts } from "@/lib/use-products";
import { useTrafficSummary } from "@/lib/use-traffic-summary";
import { useMarketplaceHealth } from "@/lib/use-marketplace-health";
import { detectRevenueOpportunities } from "./opportunities";
import { evaluateFlashDeals, flashRevenueForecast } from "./flash-intel";
import { rankProducts, unitPrice, velocityPerDay } from "./scoring";
import { buildForecast } from "./forecast";
import { detectRevenueAlerts } from "./alerts";
import { applyLearning, dismissedIds } from "./learning";
import type { RevenueSnapshot } from "./types";

export type RevenueIntelligenceState = {
  snapshot: RevenueSnapshot | null;
  analytics: ExecutiveAnalytics | null;
  loading: boolean;
  error: string | null;
  /** Bump to re-apply learning weights after an accept/dismiss. */
  refreshLearning: () => void;
};

export function useRevenueIntelligence(): RevenueIntelligenceState {
  const fetchAnalytics = useServerFn(getExecutiveAnalyticsFn);
  const [analytics, setAnalytics] = useState<ExecutiveAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(true);
  const [learningTick, setLearningTick] = useState(0);

  const { products, loading: productsLoading } = useProducts();
  const traffic = useTrafficSummary(30);
  const { health, listings } = useMarketplaceHealth();

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const data = await fetchAnalytics({ data: undefined } as never);
        if (!alive) return;
        setAnalytics(data as ExecutiveAnalytics);
        setError(null);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Could not load revenue analytics.");
      } finally {
        if (alive) setLoadingAnalytics(false);
      }
    };
    load();
    const poll = setInterval(load, 120_000);
    return () => {
      alive = false;
      clearInterval(poll);
    };
  }, [fetchAnalytics]);

  const readiness = useMemo(
    () => new Map(listings.map((l) => [l.productSlug, l.readiness.score])),
    [listings],
  );

  const snapshot = useMemo<RevenueSnapshot | null>(() => {
    if (!analytics || productsLoading) return null;
    void learningTick;

    const live = products.filter((p) => p.status === "published");
    const categoryRevenue = new Map(
      analytics.revenue_by_category.map((r) => [String(r.k).toLowerCase(), r.v]),
    );

    const ranking = rankProducts(live, { readiness });
    const hidden = dismissedIds();
    const opportunities = applyLearning(
      detectRevenueOpportunities({ products: live, categoryRevenue, readiness }),
    ).filter((o) => !hidden.has(o.id));

    const flash = evaluateFlashDeals(live);
    const alerts = detectRevenueAlerts({
      products: live,
      conversionRate: traffic.conversion,
      views: traffic.views,
      orders: traffic.orders,
    });

    const flashRevenue = live
      .filter((p) => p.flashDeal || p.hotDeal)
      .reduce((s, p) => s + velocityPerDay(p) * 30 * unitPrice(p), 0);

    const forecast = buildForecast({
      revToday: analytics.kpis.rev_today,
      revWeek: analytics.kpis.rev_week,
      revMonth: analytics.kpis.rev_month,
      daily: analytics.daily ?? [],
      flashForecast: flashRevenueForecast(live),
    });

    const lostRevenue = opportunities.reduce((s, o) => s + o.estimatedGain, 0);
    const monthly = analytics.kpis.rev_month || 1;

    return {
      version: 1,
      kpis: {
        today: analytics.kpis.rev_today,
        week: analytics.kpis.rev_week,
        month: analytics.kpis.rev_month,
        aov: analytics.profit.aov,
        conversionRate: traffic.conversion,
        flashRevenue: Math.round(flashRevenue),
        ordersToday: analytics.kpis.ord_today,
        ordersMonth: analytics.kpis.ord_month,
        topCategories: analytics.revenue_by_category
          .slice(0, 6)
          .map((r) => ({ label: r.k, revenue: r.v, units: r.units })),
        topVendors: analytics.revenue_by_brand.slice(0, 6).map((r) => ({ label: r.k, revenue: r.v })),
        topProducts: analytics.top_products
          .slice(0, 6)
          .map((r) => ({ slug: r.slug, name: r.name, revenue: r.revenue, units: r.units })),
        lostRevenue,
        currency: "INR",
      },
      opportunities,
      flash,
      ranking,
      forecast,
      alerts,
      summary: {
        healthScore: health?.score ?? 0,
        growthAvailable: Math.round((lostRevenue / monthly) * 100),
        highestPriority: opportunities[0]?.title ?? "No open revenue opportunities.",
        highestRisk: alerts[0]?.title ?? "No revenue risks detected.",
      },
      generatedAt: new Date().toISOString(),
      advisoryOnly: true,
    };
  }, [analytics, products, productsLoading, readiness, traffic, health, learningTick]);

  return {
    snapshot,
    analytics,
    loading: loadingAnalytics || productsLoading,
    error,
    refreshLearning: () => setLearningTick((t) => t + 1),
  };
}
