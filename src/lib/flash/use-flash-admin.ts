/**
 * Single data spine for the Flash Deals Command Center.
 *
 * Reads only existing tables (`flash_deals`, `flash_deal_events`, `products`,
 * `product_badges`, `flash_deal_audit_log`) and reuses the existing rotation
 * helpers so the admin view of "what will show" matches the storefront exactly.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProducts } from "@/lib/use-products";
import type { Product } from "@/lib/products";
import { useRotationNonce } from "@/lib/use-rotation-nonce";
import { flashWindowSeed, seededShuffle } from "@/lib/rotation-windows";
import { productInHomepageCollection, useBadgeCatalog } from "@/lib/use-product-badges";
import { useHomepageCollectionRules } from "@/lib/site-rules";
import { useFlashOps } from "@/lib/flash/flash-ops";
import {
  EMPTY_STATS,
  scoreDeal,
  type DealHealth,
  type DealStats,
  type DealStatus,
  type WarningKey,
} from "@/lib/flash/flash-health";

export type FlashDealRow = {
  id: string;
  product_id: string;
  flash_price: number;
  start_at: string;
  end_at: string;
  priority: number;
  active: boolean;
  created_at: string;
};

export type AuditRow = {
  id: string;
  ran_at: string;
  expired_deactivated: number;
  invalid_product_deactivated: number;
  out_of_stock_deactivated: number;
  duplicates_found: number;
};

export type DealEntry = {
  key: string;
  product: Product;
  deal: FlashDealRow | null;
  status: DealStatus;
  hasBadge: boolean;
  regularPrice: number;
  dealPrice: number;
  discountPct: number;
  savings: number;
  msRemaining: number | null;
  stats: DealStats;
  warnings: WarningKey[];
  health: DealHealth;
  /** Index in the current seeded rotation, or null when not eligible. */
  rotationRank: number | null;
  campaign: string | null;
};

const SIX_HOURS = 6 * 3600_000;

export function useFlashAdminData() {
  const { products, loading: productsLoading } = useProducts();
  const { map: badgeMap, types: badgeTypes, loading: badgesLoading } = useBadgeCatalog();
  const rules = useHomepageCollectionRules();
  const nonce = useRotationNonce();
  const { ops } = useFlashOps();

  const [deals, setDeals] = useState<FlashDealRow[] | null>(null);
  const [events, setEvents] = useState<{ event_type: string; deal_id: string | null; created_at: string }[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const fetchDeals = useCallback(() => {
    void supabase
      .from("flash_deals")
      .select("id,product_id,flash_price,start_at,end_at,priority,active,created_at")
      .order("priority", { ascending: false })
      .order("created_at", { ascending: false })
      .then(({ data }) => setDeals((data as FlashDealRow[] | null) ?? []));
  }, []);

  const fetchEvents = useCallback(() => {
    const since = new Date(Date.now() - 30 * 86400_000).toISOString();
    void supabase
      .from("flash_deal_events")
      .select("event_type,deal_id,created_at")
      .gte("created_at", since)
      .then(({ data }) => setEvents((data as typeof events | null) ?? []));
  }, []);

  const fetchAudit = useCallback(() => {
    void supabase
      .from("flash_deal_audit_log")
      .select("id,ran_at,expired_deactivated,invalid_product_deactivated,out_of_stock_deactivated,duplicates_found")
      .order("ran_at", { ascending: false })
      .limit(20)
      .then(({ data }) => setAudit((data as AuditRow[] | null) ?? []));
  }, []);

  const refresh = useCallback(() => {
    fetchDeals();
    fetchEvents();
    fetchAudit();
  }, [fetchDeals, fetchEvents, fetchAudit]);

  useEffect(() => {
    refresh();
    const ch = supabase
      .channel("admin-flash-command-center")
      .on("postgres_changes", { event: "*", schema: "public", table: "flash_deals" }, fetchDeals)
      .on("postgres_changes", { event: "*", schema: "public", table: "flash_deal_events" }, fetchEvents)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [refresh, fetchDeals, fetchEvents]);

  const statsByDeal = useMemo(() => {
    const map = new Map<string, DealStats>();
    for (const e of events) {
      if (!e.deal_id) continue;
      const cur = map.get(e.deal_id) ?? { ...EMPTY_STATS };
      if (e.event_type === "impression") cur.views++;
      else if (e.event_type === "click") cur.clicks++;
      else if (e.event_type === "purchase") cur.purchases++;
      map.set(e.deal_id, cur);
    }
    for (const s of map.values()) {
      s.ctr = s.views > 0 ? (s.clicks / s.views) * 100 : 0;
      s.conversion = s.views > 0 ? (s.purchases / s.views) * 100 : 0;
    }
    return map;
  }, [events]);

  const productById = useMemo(() => {
    const m = new Map<string, Product>();
    for (const p of products) if (p.id) m.set(p.id, p);
    return m;
  }, [products]);

  const cap = Math.max(1, Math.floor(rules.limits.flash_deals));

  /** Products eligible for the storefront right now (mirrors useFlashDeals). */
  const eligible = useMemo(
    () =>
      products.filter(
        (p) =>
          productInHomepageCollection(p.slug, badgeMap.get(p.slug), ["flash_deal", "hot_deal"], now) &&
          p.status === "published" &&
          p.inStock &&
          p.stockQuantity > 0,
      ),
    [products, badgeMap, now],
  );

  const seed = flashWindowSeed(now) + nonce;
  const rotation = useMemo(() => seededShuffle(eligible, seed), [eligible, seed]);
  const nextRotation = useMemo(
    () => seededShuffle(eligible, flashWindowSeed(now + SIX_HOURS) + nonce),
    [eligible, now, nonce],
  );
  const prevRotation = useMemo(
    () => seededShuffle(eligible, flashWindowSeed(now - SIX_HOURS) + nonce),
    [eligible, now, nonce],
  );
  const rankBySlug = useMemo(() => {
    const m = new Map<string, number>();
    rotation.forEach((p, i) => m.set(p.slug, i));
    return m;
  }, [rotation]);

  const entries = useMemo<DealEntry[]>(() => {
    if (!deals) return [];

    // Priority conflicts: two active deals sharing a non-zero priority.
    const priorityCount = new Map<number, number>();
    for (const d of deals) {
      if (!d.active || d.priority === 0) continue;
      priorityCount.set(d.priority, (priorityCount.get(d.priority) ?? 0) + 1);
    }

    const rows: DealEntry[] = [];
    const seenProducts = new Set<string>();

    const push = (product: Product, deal: FlashDealRow | null) => {
      const hasBadge = productInHomepageCollection(
        product.slug,
        badgeMap.get(product.slug),
        ["flash_deal", "hot_deal"],
        now,
      );
      const regular = product.price ?? 0;
      const dealPrice = deal ? deal.flash_price : regular;
      const start = deal ? new Date(deal.start_at).getTime() : 0;
      const end = deal ? new Date(deal.end_at).getTime() : 0;

      let status: DealStatus = "no_deal";
      if (deal) {
        if (!deal.active) status = "paused";
        else if (end < now) status = "expired";
        else if (start > now) status = "scheduled";
        else status = "active";
      }

      const discountPct = regular > 0 && dealPrice < regular ? Math.round(((regular - dealPrice) / regular) * 100) : 0;
      const rotationRank = rankBySlug.has(product.slug) ? rankBySlug.get(product.slug)! : null;

      const warnings: WarningKey[] = [];
      if (status === "expired") warnings.push("expired");
      if (status === "paused") warnings.push("inactive");
      if (!product.inStock || product.stockQuantity <= 0) warnings.push("out_of_stock");
      if (!hasBadge) warnings.push("badge_missing");
      if (deal && dealPrice >= regular) warnings.push("price_conflict");
      if (deal && deal.active && deal.priority !== 0 && (priorityCount.get(deal.priority) ?? 0) > 1)
        warnings.push("priority_conflict");
      if (rotationRank != null && rotationRank >= cap) warnings.push("hidden_by_rules");
      if (discountPct > ops.maxDiscountPct) warnings.push("over_discount");

      const stats = (deal && statsByDeal.get(deal.id)) || EMPTY_STATS;
      const msRemaining = deal && status === "active" ? Math.max(0, end - now) : null;

      rows.push({
        key: deal ? deal.id : `p:${product.slug}`,
        product,
        deal,
        status,
        hasBadge,
        regularPrice: regular,
        dealPrice,
        discountPct,
        savings: Math.max(0, regular - dealPrice),
        msRemaining,
        stats,
        warnings,
        health: scoreDeal({ product, status, discountPct, msRemaining, stats, hasBadge, warnings }),
        rotationRank,
        campaign: deal ? ops.dealCampaigns[deal.id] ?? null : null,
      });
    };

    for (const d of deals) {
      const p = productById.get(d.product_id);
      if (!p) continue;
      seenProducts.add(p.slug);
      push(p, d);
    }
    // Badged products without a commercial deal row still belong in the console.
    for (const p of products) {
      if (seenProducts.has(p.slug)) continue;
      if (!productInHomepageCollection(p.slug, badgeMap.get(p.slug), ["flash_deal", "hot_deal"], now)) continue;
      push(p, null);
    }

    return rows;
  }, [deals, products, productById, badgeMap, now, statsByDeal, rankBySlug, cap, ops.maxDiscountPct, ops.dealCampaigns]);

  const totals = useMemo(() => {
    const views = entries.reduce((a, e) => a + e.stats.views, 0);
    const clicks = entries.reduce((a, e) => a + e.stats.clicks, 0);
    const purchases = entries.reduce((a, e) => a + e.stats.purchases, 0);
    const withDeal = entries.filter((e) => e.deal);
    const avgDiscount = withDeal.length
      ? withDeal.reduce((a, e) => a + e.discountPct, 0) / withDeal.length
      : 0;
    return {
      active: entries.filter((e) => e.status === "active").length,
      scheduled: entries.filter((e) => e.status === "scheduled").length,
      expired: entries.filter((e) => e.status === "expired" || e.status === "paused").length,
      eligible: eligible.length,
      avgDiscount,
      estRevenue: entries.reduce((a, e) => a + e.stats.purchases * e.dealPrice, 0),
      views,
      clicks,
      purchases,
      ctr: views > 0 ? (clicks / views) * 100 : 0,
      conversion: views > 0 ? (purchases / views) * 100 : 0,
    };
  }, [entries, eligible.length]);

  return {
    entries,
    totals,
    deals: deals ?? [],
    products,
    badgeTypes,
    audit,
    events,
    rotation,
    nextRotation,
    prevRotation,
    seed,
    nonce,
    cap,
    now,
    ops,
    loading: productsLoading || badgesLoading || deals === null,
    refresh,
  };
}
