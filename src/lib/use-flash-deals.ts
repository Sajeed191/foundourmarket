import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProducts } from "@/lib/use-products";
import type { Product } from "@/lib/products";
import { useRotationNonce } from "@/lib/use-rotation-nonce";
import { flashWindowSeed, seededShuffle } from "@/lib/rotation-windows";
import { hasAssignedCollectionBadge, productInHomepageCollection, useBadgeCatalog } from "@/lib/use-product-badges";
import { evaluatePromoEligibility } from "@/lib/promo-eligibility";
import { useHomepageCollectionRules } from "@/lib/site-rules";

/** Absolute upper bound on visibly-promoted Flash Deals, regardless of admin config. */
const FLASH_VISIBLE_HARD_CAP = 50;

/** A row from the dedicated flash_deals table (optional flash pricing + window). */
export type DealRow = {
  id: string;
  product_id: string;
  flash_price: number;
  start_at: string;
  end_at: string;
  priority: number;
  created_at: string;
};

/** A storefront flash-deal entry built from a catalog product. */
export type FlashItem = {
  product: Product;
  /** Live override price from flash_deals table, if any. */
  flashPrice: number | null;
  /** Countdown end, if a live deal window applies. */
  endAt: string | null;
  dealId: string | null;
  priority: number;
};

/**
 * @deprecated Legacy helper retained only for older non-homepage callers.
 * Curated homepage Flash Deal membership is driven by live `product_badges`
 * assignments enforced by the Site Rules Controller. Do not use in new code.
 */
export function isFlashDealProduct(p: Product): boolean {
  if (p.flashDeal || p.hotDeal) return true;
  const tokens = (p.collections ?? []).map((c) => c.toLowerCase().replace(/[\s_]+/g, "-"));
  return tokens.includes("flash-deal") || tokens.includes("flash-deals");
}

function useNow(intervalMs = 60_000, enabled = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, enabled]);
  return now;
}




type UseFlashDealsOptions = {
  /**
   * Override how many live deals are returned. "all" returns every eligible live
   * deal up to the hard safety cap (FLASH_VISIBLE_HARD_CAP). A number is
   * clamped between 1 and the hard cap. Defaults to the Site Rules configured
   * limit, which is 20 for the homepage.
   */
  limit?: number | "all";
};

/**
 * Single shared source of truth for Flash Deal products. Used by the homepage
 * Flash Deals section, the Deals & Promotions / Offers page, and any "Shop
 * Deals" destination so all surfaces return the exact same products.
 */
export function useFlashDeals(options?: UseFlashDealsOptions) {
  const { products, loading } = useProducts();
  const { map: badgeAssignments, loading: badgesLoading } = useBadgeCatalog();
  const rules = useHomepageCollectionRules();
  const [deals, setDeals] = useState<DealRow[]>([]);
  const now = useNow(60_000, true);
  const rotationNonce = useRotationNonce();

  function fetchDeals() {
    supabase
      .from("flash_deals")
      .select("id,product_id,flash_price,start_at,end_at,priority,created_at")
      .then(({ data }) => {
        setDeals((data as DealRow[] | null) ?? []);
      });
  }

  useEffect(() => {
    fetchDeals();
    const ch = supabase
      .channel("rt-flash-deals-shared")
      .on("postgres_changes", { event: "*", schema: "public", table: "flash_deals" }, fetchDeals)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  // Map of live deal overrides keyed by public product id (only deals in their window).
  const liveDealByProductId = useMemo(() => {
    const map = new Map<string, DealRow>();
    for (const d of deals) {
      if (!d.product_id) continue;
      const startOk = new Date(d.start_at).getTime() <= now;
      const endOk = new Date(d.end_at).getTime() > now;
      if (!startOk || !endOk) continue;
      const existing = map.get(d.product_id);
      if (!existing || d.priority > existing.priority) map.set(d.product_id, d);
    }
    return map;
  }, [deals, now]);

  // Two-stage rotation (both configurable in Admin → Site Rules):
  //  1. Selection window (default 6h IST): which eligible products go live.
  //  2. Order window (default 2h IST): how those live products are ordered.
  // The manual reshuffle nonce lets admins re-randomize both instantly.
  const selectionSeed = windowSeed(now, rules.flashSelectionHours) + rotationNonce;
  const orderSeed = windowSeed(now, rules.rotationHours) + rotationNonce;



  const result = useMemo(() => {
    // Strict badge-driven eligibility: badge exists → live → single-promo
    // resolver → published + in stock. Nothing else may enter Flash Deals.
    const gate = evaluatePromoEligibility(products, badgeAssignments, "flash_deals", now);
    const totalFlagged = gate.eligible.length + gate.counts.unpublished + gate.counts.out_of_stock;
    const excludedUnavailable = gate.counts.unpublished + gate.counts.out_of_stock;
    const active: FlashItem[] = gate.eligible.map((p) => {
      const live = p.id ? liveDealByProductId.get(p.id) ?? null : null;
      return {
        product: p,
        flashPrice: live ? live.flash_price : null,
        endAt: live ? live.end_at : null,
        dealId: live ? live.id : null,
        priority: live ? live.priority : 0,
      };
    });

    // "all" expands to the hard safety cap so the Explore page can display
    // every live deal without overriding Site Rules. A numeric override is
    // clamped between 1 and FLASH_VISIBLE_HARD_CAP.
    const requestedLimit = options?.limit;
    const configuredCap =
      requestedLimit === "all"
        ? FLASH_VISIBLE_HARD_CAP
        : Math.max(
            1,
            Math.min(
              FLASH_VISIBLE_HARD_CAP,
              Math.floor(requestedLimit ?? rules.limits.flash_deals),
            ),
          );
    const cap = Math.min(configuredCap, active.length);
    // Stage 1 — pick the live set for this selection window.
    const selected = seededShuffle(active, selectionSeed).slice(0, cap);
    // Stage 2 — reorder the same set on the faster order window.
    const ordered = seededShuffle(selected, orderSeed);

    if (typeof window !== "undefined" && import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.info(`[FlashDeals] eligible: ${active.length} | live this window: ${ordered.length} | excluded unavailable: ${excludedUnavailable} | flagged: ${totalFlagged} | cap: ${cap} | selection: ${rules.flashSelectionHours}h | order: ${rules.rotationHours}h`);
      // eslint-disable-next-line no-console
      console.info("[FlashDeals] current display order:", ordered.map((i) => i.product.slug));
    }

    return {
      items: ordered,
      eligibleCount: active.length,
      windowCount: selected.length,
      hiddenByLimit: Math.max(0, active.length - selected.length),
      cap,
    };
  }, [products, badgeAssignments, liveDealByProductId, selectionSeed, orderSeed, now, rules.limits.flash_deals, rules.flashSelectionHours, rules.rotationHours]);



  return {
    items: result.items,
    eligibleCount: result.eligibleCount,
    windowCount: result.windowCount,
    hiddenByLimit: result.hiddenByLimit,
    cap: result.cap,
    loading: loading || badgesLoading,
    now,
    products,
  };
}
