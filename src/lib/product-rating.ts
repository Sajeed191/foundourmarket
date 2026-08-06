/**
 * Centralized rating resolution — the single source of truth for what every
 * product surface (cards, PDP, browse, search, flash deals, recommendations,
 * wishlist, compare, carousels) displays for rating + review count.
 *
 * Data model:
 *  - `initial_rating` / `initial_review_count`  → admin-supplied aggregate
 *    social proof (imported/supplier metadata). NEVER fake review rows.
 *  - real customer reviews                      → rows in `product_reviews`.
 *  - `products.rating` / `products.reviews`     → denormalized blend of the
 *    two, maintained by `recalculate_product_rating()` in the database.
 *
 * The blend rule (DB + this resolver agree):
 *   no real reviews  → admin baseline rating & count
 *   no admin baseline→ real customer average & count
 *   both             → weighted average, counts summed
 */

export type RatingSourceKind = "admin_baseline" | "customer_reviews" | "combined" | "none";

export type ResolvedRating = {
  /** Rating to display (0 when there is genuinely nothing to show). */
  rating: number;
  /** Review/customer count to display. */
  count: number;
  /** Where the displayed numbers came from. */
  source: RatingSourceKind;
  /** True when there is any rating/count worth displaying. */
  hasReviews: boolean;
};

export type RatingInput = {
  /** Denormalized blended value (`products.rating`). */
  rating?: number | string | null;
  /** Denormalized blended count (`products.reviews`). */
  reviews?: number | string | null;
  initial_rating?: number | string | null;
  initial_review_count?: number | string | null;
  /** camelCase variants used by some client models. */
  initialRating?: number | string | null;
  initialReviewCount?: number | string | null;
  /** Real customer aggregates, when a surface has already computed them. */
  customerRating?: number | string | null;
  customerReviewCount?: number | string | null;
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Blend an admin baseline with real customer review aggregates. */
export function blendRating(
  baselineRating: number,
  baselineCount: number,
  customerRating: number,
  customerCount: number,
): ResolvedRating {
  const br = num(baselineRating);
  const bc = Math.round(num(baselineCount));
  const cr = num(customerRating);
  const cc = Math.round(num(customerCount));

  if (cc > 0 && bc > 0 && br > 0) {
    const count = bc + cc;
    const rating = (br * bc + cr * cc) / count;
    return { rating: Math.round(rating * 100) / 100, count, source: "combined", hasReviews: true };
  }
  if (cc > 0) {
    return { rating: Math.round(cr * 100) / 100, count: cc, source: "customer_reviews", hasReviews: true };
  }
  if (br > 0 || bc > 0) {
    return { rating: Math.round(br * 100) / 100, count: bc, source: "admin_baseline", hasReviews: br > 0 || bc > 0 };
  }
  return { rating: 0, count: 0, source: "none", hasReviews: false };
}

/**
 * Resolve what to display for a product. Works with any shape that carries the
 * denormalized `rating`/`reviews` columns, and refines the answer when the
 * admin baseline and/or real customer aggregates are also available.
 */
export function resolveProductRating(product: RatingInput | null | undefined): ResolvedRating {
  if (!product) return { rating: 0, count: 0, source: "none", hasReviews: false };

  const baselineRating = num(product.initial_rating ?? product.initialRating);
  const baselineCount = num(product.initial_review_count ?? product.initialReviewCount);
  const hasCustomerAggregates =
    product.customerRating != null || product.customerReviewCount != null;

  if (hasCustomerAggregates || baselineRating > 0 || baselineCount > 0) {
    return blendRating(
      baselineRating,
      baselineCount,
      num(product.customerRating),
      num(product.customerReviewCount),
    );
  }

  // Fall back to the denormalized blend maintained by the database.
  const rating = num(product.rating);
  const count = Math.round(num(product.reviews));
  if (rating <= 0 && count <= 0) return { rating: 0, count: 0, source: "none", hasReviews: false };
  return { rating, count, source: "combined", hasReviews: true };
}

/** Display helper: "4.5 (112)" style parts, or null when there is nothing. */
export function formatRatingLabel(resolved: ResolvedRating): string | null {
  if (!resolved.hasReviews) return null;
  return resolved.count > 0
    ? `${resolved.rating.toFixed(1)} (${resolved.count.toLocaleString()})`
    : resolved.rating.toFixed(1);
}
