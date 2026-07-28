import type { Product } from "@/lib/products";
import {
  matchesBadgeKeys,
  isRenderBadgeLive,
  renderBadgeInactiveReason,
  productInHomepageCollection,
  type RenderBadge,
} from "@/lib/use-product-badges";

/**
 * Promotional Eligibility Pipeline — the ONE gate every homepage promotional
 * surface must pass products through:
 *
 *   Products → badge validation → availability validation → promo resolver
 *            → (caller) rotation → display
 *
 * Nothing renders in a promotional rail without owning the section's badge.
 */

export type PromoSectionKey =
  | "flash_deals"
  | "trending"
  | "best_sellers"
  | "new_arrivals"
  | "featured";

/** Badge keys that grant membership of each promotional section. */
export const PROMO_SECTION_BADGES: Record<PromoSectionKey, string[]> = {
  flash_deals: ["flash_deal", "hot_deal"],
  trending: ["trending"],
  best_sellers: ["bestseller"],
  new_arrivals: ["new"],
  featured: ["featured"],
};

export type ExclusionReason =
  | "missing_badge"
  | "badge_inactive"
  | "badge_expired"
  | "badge_scheduled"
  | "unpublished"
  | "out_of_stock"
  | "promo_conflict";

export const EXCLUSION_LABEL: Record<ExclusionReason, string> = {
  missing_badge: "Missing required badge",
  badge_inactive: "Badge inactive / archived",
  badge_expired: "Badge expired",
  badge_scheduled: "Badge not started yet",
  unpublished: "Draft / unpublished product",
  out_of_stock: "Out of stock",
  promo_conflict: "Promotional conflict (single-badge policy)",
};

export type ExcludedProduct = { product: Product; reason: ExclusionReason };

export type PromoEligibility = {
  eligible: Product[];
  excluded: ExcludedProduct[];
  counts: Record<ExclusionReason, number>;
};

function emptyCounts(): Record<ExclusionReason, number> {
  return {
    missing_badge: 0,
    badge_inactive: 0,
    badge_expired: 0,
    badge_scheduled: 0,
    unpublished: 0,
    out_of_stock: 0,
    promo_conflict: 0,
  };
}

/** Availability gate — published + real, sellable stock. */
export function isProductAvailable(p: Product): boolean {
  return p.status === "published" && Boolean(p.inStock) && (p.stockQuantity ?? 0) > 0;
}

/**
 * Evaluates a product set against a promotional section, returning the strictly
 * eligible products plus a per-product exclusion reason for admin tooling.
 */
export function evaluatePromoEligibility(
  products: readonly Product[],
  badgeMap: Map<string, RenderBadge[]>,
  section: PromoSectionKey,
  now = Date.now(),
): PromoEligibility {
  const keys = PROMO_SECTION_BADGES[section];
  const eligible: Product[] = [];
  const excluded: ExcludedProduct[] = [];
  const counts = emptyCounts();

  const reject = (product: Product, reason: ExclusionReason) => {
    excluded.push({ product, reason });
    counts[reason]++;
  };

  for (const p of products) {
    const badges = badgeMap.get(p.slug) ?? [];
    const candidates = badges.filter((b) => matchesBadgeKeys(b, keys));

    // 1 — badge must exist
    if (candidates.length === 0) {
      reject(p, "missing_badge");
      continue;
    }
    // 2 — badge must be live (enabled + inside its date window)
    if (!candidates.some((b) => isRenderBadgeLive(b, now))) {
      const why = renderBadgeInactiveReason(candidates[0], now);
      reject(p, why === "expired" ? "badge_expired" : why === "scheduled" ? "badge_scheduled" : "badge_inactive");
      continue;
    }
    // 3 — single promotional badge policy (resolver decides the owning section)
    if (!productInHomepageCollection(p.slug, badges, keys, now)) {
      reject(p, "promo_conflict");
      continue;
    }
    // 4 — availability
    if (p.status !== "published") {
      reject(p, "unpublished");
      continue;
    }
    if (!p.inStock || (p.stockQuantity ?? 0) <= 0) {
      reject(p, "out_of_stock");
      continue;
    }
    eligible.push(p);
  }

  if (import.meta.env.DEV && typeof window !== "undefined") {
    const breakdown = (Object.keys(counts) as ExclusionReason[])
      .filter((k) => counts[k] > 0)
      .map((k) => `${EXCLUSION_LABEL[k]}=${counts[k]}`)
      .join(" | ");
    // eslint-disable-next-line no-console
    console.info(
      `[PromoEligibility · ${section}] eligible=${eligible.length} / ${products.length}${breakdown ? ` — excluded: ${breakdown}` : ""}`,
    );
  }

  return { eligible, excluded, counts };
}
