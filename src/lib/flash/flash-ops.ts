/**
 * Flash Deals Ops config — additive settings for the Flash Deals Command
 * Center. Stored as a single jsonb row in the existing generic `site_rules`
 * table (key: `flash_deal_ops`), so no schema change and no new table.
 *
 * Nothing here changes the rotation algorithm, badge system or pricing
 * contracts — these are presentation + operating preferences only.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const FLASH_OPS_KEY = "flash_deal_ops";

/** Curated campaign labels shown on the storefront band header. */
export const FLASH_CAMPAIGNS = [
  "Weekend Sale",
  "Mega Sale",
  "Festival Offer",
  "Midnight Drop",
  "Summer Deals",
  "Electronics Week",
  "Fashion Week",
  "Back to School",
  "Clearance",
  "Limited Edition",
] as const;

export type FlashOps = {
  /** Storefront campaign label override. Null = automatic rotating label. */
  campaignLabel: string | null;
  /** Keep the flash badge on the product after its deal window expires. */
  keepBadgeOnExpiry: boolean;
  /** Admin guardrail — warn above this discount percentage. */
  maxDiscountPct: number;
  /** Hero order is locked (admins manage priority manually, no randomize). */
  heroLocked: boolean;
  /** Optional per-deal campaign tag, keyed by flash_deals.id. */
  dealCampaigns: Record<string, string>;
};

export const DEFAULT_FLASH_OPS: FlashOps = {
  campaignLabel: null,
  keepBadgeOnExpiry: true,
  maxDiscountPct: 60,
  heroLocked: false,
  dealCampaigns: {},
};

export function coerceFlashOps(raw: unknown): FlashOps {
  const src = (raw ?? {}) as Partial<FlashOps>;
  const pct = Number(src.maxDiscountPct);
  const campaigns: Record<string, string> = {};
  if (src.dealCampaigns && typeof src.dealCampaigns === "object") {
    for (const [k, v] of Object.entries(src.dealCampaigns)) {
      if (typeof v === "string" && v.trim()) campaigns[k] = v.trim().slice(0, 40);
    }
  }
  return {
    campaignLabel:
      typeof src.campaignLabel === "string" && src.campaignLabel.trim()
        ? src.campaignLabel.trim().slice(0, 40)
        : null,
    keepBadgeOnExpiry: src.keepBadgeOnExpiry !== false,
    maxDiscountPct: Number.isFinite(pct) ? Math.min(95, Math.max(5, Math.round(pct))) : DEFAULT_FLASH_OPS.maxDiscountPct,
    heroLocked: src.heroLocked === true,
    dealCampaigns: campaigns,
  };
}

/** Staff-side hook (site_rules is staff-only at the database level). */
export function useFlashOps() {
  const [ops, setOps] = useState<FlashOps>(DEFAULT_FLASH_OPS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = () =>
      supabase
        .from("site_rules")
        .select("value")
        .eq("key", FLASH_OPS_KEY)
        .maybeSingle()
        .then(({ data }) => {
          if (!active) return;
          setOps(coerceFlashOps((data as { value?: unknown } | null)?.value));
          setLoading(false);
        });
    void load();
    const ch = supabase
      .channel(`rt-flash-ops-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "site_rules", filter: `key=eq.${FLASH_OPS_KEY}` },
        () => void load(),
      )
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(ch);
    };
  }, []);

  return { ops, loading, setOps };
}

export async function saveFlashOps(next: FlashOps): Promise<void> {
  const value = coerceFlashOps(next);
  const { error } = await supabase
    .from("site_rules")
    .upsert({ key: FLASH_OPS_KEY, value }, { onConflict: "key" });
  if (error) throw new Error(error.message);
}
