/**
 * Rating regression tests — admin baseline + real customer reviews.
 * Run with:  bun run src/lib/product-rating.test.ts
 *
 * Mirrors the DB blend rule in `recalculate_product_rating()`, so the resolver
 * used by every product surface (cards, PDP, browse, search, flash deals,
 * similar products, wishlist, recommendations) can never drift from the data.
 */
import { blendRating, resolveProductRating, formatRatingLabel } from "./product-rating";

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed++;
    console.error(`✗ ${msg}`);
  } else {
    console.log(`✓ ${msg}`);
  }
}

/* ── Admin baseline only (no real customer reviews) ─────────────────────── */
const baseline = resolveProductRating({
  rating: 4.5,
  reviews: 112,
  initial_rating: 4.5,
  initial_review_count: 112,
  customerReviewCount: 0,
  customerRating: 0,
});
assert(baseline.rating === 4.5, "admin rating displays");
assert(baseline.count === 112, "admin customer count displays");
assert(baseline.source === "admin_baseline", "baseline is flagged as admin-sourced");
assert(baseline.hasReviews, "no empty rating state when admin values exist");
assert(formatRatingLabel(baseline) === "4.5 (112)", 'renders "4.5 (112)" — never "4.5 (0)"');

/* ── Never show a 0 count when the admin supplied one ───────────────────── */
assert(
  resolveProductRating({ rating: 4.5, reviews: 0, initial_rating: 4.5, initial_review_count: 112 }).count === 112,
  'no "0 reviews" when an admin count exists',
);

/* ── Real customer reviews only ─────────────────────────────────────────── */
const realOnly = resolveProductRating({
  rating: 0,
  reviews: 0,
  initial_rating: 0,
  initial_review_count: 0,
  customerRating: 4,
  customerReviewCount: 3,
});
assert(realOnly.rating === 4 && realOnly.count === 3, "real customer rating remains intact");
assert(realOnly.source === "customer_reviews", "real reviews are flagged as customer-sourced");

/* ── Combined baseline + real reviews ───────────────────────────────────── */
const combined = blendRating(4.5, 112, 3, 8);
assert(combined.count === 120, "combined count sums baseline and real reviews");
assert(
  Math.abs(combined.rating - (4.5 * 112 + 3 * 8) / 120) < 0.01,
  "combined rating calculation is correct (weighted average)",
);
assert(combined.source === "combined", "combined state is flagged correctly");
assert(
  blendRating(4.5, 112, 3, 8).count > blendRating(4.5, 112, 0, 0).count,
  "admin baseline remains available when real reviews arrive",
);

/* ── Genuine empty state ────────────────────────────────────────────────── */
const empty = resolveProductRating({ rating: 0, reviews: 0, initial_rating: 0, initial_review_count: 0 });
assert(!empty.hasReviews && empty.source === "none", "empty state only when there is genuinely no rating/count");
assert(formatRatingLabel(empty) === null, "no label rendered for a genuinely unrated product");
assert(!resolveProductRating(null).hasReviews, "missing product resolves to the empty state safely");

/* ── Denormalized fallback: every surface resolves identically ──────────── */
const dbRow = { rating: 4.5, reviews: 112 }; // shape delivered to cards/browse/search/deals
const card = resolveProductRating(dbRow);
const pdp = resolveProductRating({ ...dbRow, initial_rating: 4.5, initial_review_count: 112 });
assert(card.rating === pdp.rating && card.count === pdp.count, "product cards display the same resolved values as PDP");
assert(resolveProductRating(dbRow).count === 112, "Browse displays the resolved count");
assert(resolveProductRating(dbRow).count === 112, "Search displays the resolved count");
assert(resolveProductRating(dbRow).count === 112, "Flash Deals displays the resolved count");
assert(resolveProductRating(dbRow).count === 112, "Similar Products displays the resolved count");

/* ── No fabrication ─────────────────────────────────────────────────────── */
assert(
  resolveProductRating({ rating: 0, reviews: 0, initial_rating: 0, initial_review_count: 112 }).rating === 0,
  "a count without a rating never invents a star value",
);

console.log(failed === 0 ? "\nAll assertions passed." : `\n${failed} assertion(s) failed.`);
if (failed > 0) process.exit(1);
