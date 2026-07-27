import type { Product } from "@/lib/products";

/**
 * FoundOurMarket™ — Personal Relevance Scoring (frontend-only).
 *
 * Composes existing client signals (recently viewed, wishlist, cart, catalog
 * popularity flags) into a single deterministic score. No backend model, no
 * new persistence, no schema. Pure function so it can be unit-reasoned about
 * and memoized safely.
 */

export type RelevanceSignals = {
  recentSlugs: string[];
  wishlistSlugs: string[];
  cartSlugs: string[];
  /** Slugs already rendered by another rail — never duplicated here. */
  excludeSlugs?: string[];
};

export type RelevanceReason =
  | "wishlist"
  | "wishlist_category"
  | "recent"
  | "recent_category"
  | "brand"
  | "popular"
  | "new"
  | "generic";

export type ScoredProduct = {
  product: Product;
  score: number;
  reason: RelevanceReason;
  /** Category/brand that drove the match, when applicable. */
  anchor?: string;
};

const W = {
  wishlist: 50,
  wishlistCategory: 30,
  recent: 25,
  recentCategory: 22,
  brand: 20,
  popular: 15,
  newArrival: 10,
  inStock: 10,
  lowStockUrgency: 5,
  purchased: -100,
  outOfStock: -999,
} as const;

function categoriesOf(p: Product): string[] {
  const list = p.categories?.length ? p.categories : p.category ? [p.category] : [];
  return list.map((c) => c.toLowerCase());
}

export function scoreCandidates(products: Product[], signals: RelevanceSignals): ScoredProduct[] {
  const recent = new Set(signals.recentSlugs);
  const wishlist = new Set(signals.wishlistSlugs);
  const cart = new Set(signals.cartSlugs);
  const excluded = new Set(signals.excludeSlugs ?? []);

  const bySlug = new Map(products.map((p) => [p.slug, p]));
  const anchorProducts = [
    ...signals.wishlistSlugs.map((s) => bySlug.get(s)),
    ...signals.recentSlugs.map((s) => bySlug.get(s)),
  ].filter((p): p is Product => !!p);

  const wishlistCategories = new Set(
    signals.wishlistSlugs.flatMap((s) => {
      const p = bySlug.get(s);
      return p ? categoriesOf(p) : [];
    }),
  );
  const recentCategories = new Set(
    signals.recentSlugs.flatMap((s) => {
      const p = bySlug.get(s);
      return p ? categoriesOf(p) : [];
    }),
  );
  const favouriteBrands = new Set(
    anchorProducts.map((p) => (p.brand ?? "").toLowerCase()).filter(Boolean),
  );

  const scored: ScoredProduct[] = [];

  for (const p of products) {
    if (excluded.has(p.slug)) continue;
    if (p.status && p.status !== "published") continue;

    let score = 0;
    let reason: RelevanceReason = "generic";
    let anchor: string | undefined;

    const cats = categoriesOf(p);

    if (wishlist.has(p.slug)) {
      score += W.wishlist;
      reason = "wishlist";
    }
    if (recent.has(p.slug)) {
      score += W.recent;
      if (reason === "generic") reason = "recent";
    }
    if (!wishlist.has(p.slug) && cats.some((c) => wishlistCategories.has(c))) {
      score += W.wishlistCategory;
      if (reason === "generic") {
        reason = "wishlist_category";
        anchor = p.category;
      }
    }
    if (!recent.has(p.slug) && cats.some((c) => recentCategories.has(c))) {
      score += W.recentCategory;
      if (reason === "generic") {
        reason = "recent_category";
        anchor = p.category;
      }
    }
    if (p.brand && favouriteBrands.has(p.brand.toLowerCase())) {
      score += W.brand;
      if (reason === "generic") {
        reason = "brand";
        anchor = p.brand;
      }
    }
    if (p.trending || p.bestseller || (p.soldCount ?? 0) > 0) {
      score += W.popular;
      if (reason === "generic") reason = "popular";
    }
    if (p.newArrival) {
      score += W.newArrival;
      if (reason === "generic") reason = "new";
    }

    if (p.inStock && p.stockQuantity > 0) {
      score += W.inStock;
      if (p.stockQuantity <= (p.lowStockThreshold || 5)) score += W.lowStockUrgency;
    } else {
      score += W.outOfStock;
    }

    // Already in the cart → treated as effectively purchased intent.
    if (cart.has(p.slug)) score += W.purchased;

    if (score <= 0) continue;
    scored.push({ product: p, score, reason, anchor });
  }

  scored.sort((a, b) => b.score - a.score || a.product.slug.localeCompare(b.product.slug));
  return scored;
}

/** One dynamic subtitle derived from the strongest signal in the result set. */
export function relevanceSubtitle(top: ScoredProduct | undefined, personalized: boolean): string {
  if (!personalized || !top) return "What the community is loving right now.";
  switch (top.reason) {
    case "wishlist":
      return "Inspired by your wishlist.";
    case "wishlist_category":
      return `More like the ${top.anchor ?? "pieces"} you saved.`;
    case "recent":
      return "Continue where you left off.";
    case "recent_category":
      return `Because you viewed ${top.anchor ?? "similar items"}.`;
    case "brand":
      return `New from ${top.anchor ?? "your favourite brands"}.`;
    case "new":
      return "New in your favourite category.";
    default:
      return "Based on your interests.";
  }
}

/** One tiny personalization pill label. */
export function relevanceBadge(top: ScoredProduct | undefined, personalized: boolean): string {
  if (!personalized || !top) return "Popular Right Now";
  switch (top.reason) {
    case "wishlist":
    case "wishlist_category":
      return "Based on Wishlist";
    case "recent":
    case "recent_category":
      return "Recently Viewed";
    case "brand":
      return `More from ${top.anchor}`;
    case "new":
      return "New Arrivals";
    default:
      return "Recommended";
  }
}
