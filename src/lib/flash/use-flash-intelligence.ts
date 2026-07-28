/**
 * Intelligence layer for the Flash Deals Command Center.
 *
 * Consumes the existing v4.0 data spine (`useFlashAdminData`) and reuses the
 * live rotation helpers to simulate future windows. Read-only and derived —
 * it never mutates deals, badges, prices, schedules or priorities.
 */
import { useMemo } from "react";
import { flashWindowSeed, seededShuffle } from "@/lib/rotation-windows";
import type { Product } from "@/lib/products";
import type { useFlashAdminData, DealEntry } from "@/lib/flash/use-flash-admin";
import {
  assistantInsights, coverageBy, detectConflicts, heroOptimizer, homepageQuality,
  intelligenceScore, recommendProducts, schedulingWarnings,
  type DealIntelligence,
} from "@/lib/flash/flash-intelligence";

const SIX_HOURS = 6 * 3600_000;

export type SimWindow = {
  key: string;
  label: string;
  startsAt: number;
  seed: number;
  hero: Product | null;
  mini: Product[];
  hidden: Product[];
};

export type FlashAdminData = ReturnType<typeof useFlashAdminData>;

export function useFlashIntelligence(data: FlashAdminData) {
  const { entries, products, rotation, cap, now, nonce, ops } = data;

  /** Eligible pool in rotation order = products the storefront may show. */
  const eligible = useMemo(() => rotation, [rotation]);

  /** Simulated rotation windows: current, next, next 24h, next 7 days. */
  const windows = useMemo<SimWindow[]>(() => {
    const offsets: { label: string; ms: number }[] = [
      { label: "Current rotation", ms: 0 },
      { label: "Next rotation", ms: SIX_HOURS },
      { label: "In 12 hours", ms: 2 * SIX_HOURS },
      { label: "In 18 hours", ms: 3 * SIX_HOURS },
      { label: "In 24 hours", ms: 4 * SIX_HOURS },
      { label: "In 2 days", ms: 8 * SIX_HOURS },
      { label: "In 3 days", ms: 12 * SIX_HOURS },
      { label: "In 5 days", ms: 20 * SIX_HOURS },
      { label: "In 7 days", ms: 28 * SIX_HOURS },
    ];
    return offsets.map(({ label, ms }) => {
      const at = now + ms;
      const seed = flashWindowSeed(at) + nonce;
      const order = seededShuffle(eligible, seed);
      return {
        key: `${label}-${seed}`,
        label,
        startsAt: flashWindowSeed(at),
        seed,
        hero: order[0] ?? null,
        mini: order.slice(1, cap),
        hidden: order.slice(cap),
      };
    });
  }, [eligible, now, nonce, cap]);

  /** How many consecutive upcoming windows each product stays visible. */
  const rotationStreaks = useMemo(() => {
    const m = new Map<string, number>();
    for (const w of windows.slice(0, 5)) {
      const visible = new Set([w.hero?.slug, ...w.mini.map((p) => p.slug)].filter(Boolean) as string[]);
      for (const slug of visible) m.set(slug, (m.get(slug) ?? 0) + 1);
    }
    return m;
  }, [windows]);

  const visibleSlugs = useMemo(
    () => new Set(rotation.slice(0, cap).map((p) => p.slug)),
    [rotation, cap],
  );

  const averages = useMemo(() => {
    const withTraffic = entries.filter((e) => e.stats.views > 0);
    const avgCtr = withTraffic.length ? withTraffic.reduce((a, e) => a + e.stats.ctr, 0) / withTraffic.length : 2;
    const avgConversion = withTraffic.length ? withTraffic.reduce((a, e) => a + e.stats.conversion, 0) / withTraffic.length : 1;
    return { avgCtr, avgConversion };
  }, [entries]);

  const categoryShare = useMemo(() => {
    const visible = entries.filter((e) => visibleSlugs.has(e.product.slug));
    const m = new Map<string, number>();
    for (const e of visible) {
      const c = e.product.category || "Unspecified";
      m.set(c, (m.get(c) ?? 0) + 1);
    }
    const total = Math.max(1, visible.length);
    for (const [k, v] of m) m.set(k, v / total);
    return m;
  }, [entries, visibleSlugs]);

  const scores = useMemo(() => {
    const m = new Map<string, DealIntelligence>();
    for (const e of entries) {
      m.set(e.key, intelligenceScore(e, {
        avgCtr: averages.avgCtr,
        avgConversion: averages.avgConversion,
        categoryShare: categoryShare.get(e.product.category || "Unspecified") ?? 0,
        cap,
        maxDiscountPct: ops.maxDiscountPct,
        rotationStreak: rotationStreaks.get(e.product.slug) ?? 0,
      }));
    }
    return m;
  }, [entries, averages, categoryShare, cap, ops.maxDiscountPct, rotationStreaks]);

  const visibleEntries = useMemo(
    () => entries.filter((e) => visibleSlugs.has(e.product.slug)),
    [entries, visibleSlugs],
  );

  const quality = useMemo(
    () => homepageQuality(visibleEntries, scores, cap, now),
    [visibleEntries, scores, cap, now],
  );

  const underCategories = useMemo(() => {
    const all = new Set(products.map((p) => p.category).filter(Boolean));
    return [...all].filter((c) => (categoryShare.get(c) ?? 0) < 0.1);
  }, [products, categoryShare]);

  const recommendations = useMemo(
    () => recommendProducts(products, entries, { campaignLabel: ops.campaignLabel, underCategories }),
    [products, entries, ops.campaignLabel, underCategories],
  );

  const conflicts = useMemo(
    () => [
      ...detectConflicts(entries, { maxDiscountPct: ops.maxDiscountPct, categoryShare, cap, rotationStreaks }),
      ...schedulingWarnings(entries, now),
    ],
    [entries, ops.maxDiscountPct, categoryShare, cap, rotationStreaks, now],
  );

  const hero = useMemo(
    () => heroOptimizer(entries, rotation.slice(0, cap).map((p) => p.slug), scores),
    [entries, rotation, cap, scores],
  );

  const insights = useMemo(
    () => assistantInsights(entries, scores, {
      visibleSlugs, rotationStreaks, categoryShare,
      avgCtr: averages.avgCtr, avgConversion: averages.avgConversion, now,
    }),
    [entries, scores, visibleSlugs, rotationStreaks, categoryShare, averages, now],
  );

  const categories = useMemo(
    () => coverageBy(entries, visibleSlugs, (e) => e.product.category),
    [entries, visibleSlugs],
  );
  const brands = useMemo(
    () => coverageBy(entries, visibleSlugs, (e) => e.product.brand ?? "Unbranded"),
    [entries, visibleSlugs],
  );

  /** Rotation fairness buckets. */
  const fairness = useMemo(() => {
    const featuredNow: DealEntry[] = [];
    const upcoming: DealEntry[] = [];
    const waiting: DealEntry[] = [];
    for (const e of entries) {
      if (visibleSlugs.has(e.product.slug)) featuredNow.push(e);
      else if ((rotationStreaks.get(e.product.slug) ?? 0) > 0) upcoming.push(e);
      else waiting.push(e);
    }
    return { featuredNow, upcoming, waiting };
  }, [entries, visibleSlugs, rotationStreaks]);

  const stock = useMemo(() => {
    const critical = entries.filter((e) => (e.product.stockQuantity ?? 0) <= 3);
    const healthy = entries.filter((e) => {
      const q = e.product.stockQuantity ?? 0;
      return q > 3 && q <= 200;
    });
    const excess = entries.filter((e) => (e.product.stockQuantity ?? 0) > 200);
    return { critical, healthy, excess };
  }, [entries]);

  return {
    scores, quality, recommendations, conflicts, hero, insights,
    categories, brands, fairness, stock, windows, rotationStreaks, visibleSlugs,
    averages, visibleEntries,
  };
}
