import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Check, Heart, Loader2, Star, Zap } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";

import { useProducts } from "@/lib/use-products";
import { resolveImage, type Product } from "@/lib/products";
import { useRegion } from "@/lib/region";
import { useCompare } from "@/hooks/use-compare";
import { useCartActions } from "@/lib/cart";
import { useWishlistActions, useWishlistSaved } from "@/lib/wishlist";
import { useBuyNow } from "@/lib/use-buy-now";
import { Sheet, SheetContent } from "@/components/ui/sheet";

/**
 * PDP — Similar Products (v8.0 · Premium Recommendation Experience)
 *
 * Focused shopping-assistant surface. Every card commits to a single primary
 * action (compare), delegates purchase intent to the Quick Preview, and shows
 * ONE data-backed confidence label so customers can scan and decide.
 * Algorithm, compare store, sort tabs, and routing are unchanged.
 */

const VISIBLE_LIMIT = 12;
const VIEW_MORE_THRESHOLD = 8;

type SortKey = "best" | "price" | "rating" | "popular" | "new";

const SORT_TABS: { value: SortKey; label: string }[] = [
  { value: "best", label: "Best Match" },
  { value: "price", label: "Lower Price" },
  { value: "rating", label: "Top Rated" },
  { value: "popular", label: "Most Popular" },
  { value: "new", label: "New Arrivals" },
];

const SORT_STORAGE_KEY = "fom_pdp_similar_sort";

function readSort(): SortKey {
  if (typeof window === "undefined") return "best";
  try {
    const v = sessionStorage.getItem(SORT_STORAGE_KEY);
    if (v && SORT_TABS.some((t) => t.value === v)) return v as SortKey;
  } catch { /* noop */ }
  return "best";
}

function writeSort(v: SortKey) {
  if (typeof window === "undefined") return;
  try { sessionStorage.setItem(SORT_STORAGE_KEY, v); } catch { /* noop */ }
}

type Pill = { label: string; tone: "emerald" | "sky" | "amber" | "violet" | "neutral" };

function pillFor(p: Product, shipping: number): Pill | null {
  if (shipping === 0) return { label: "Free delivery", tone: "emerald" };
  if (p.fastSelling) return { label: "Fast delivery", tone: "sky" };
  if (
    p.inStock !== false &&
    p.stockQuantity > 0 &&
    p.lowStockThreshold > 0 &&
    p.stockQuantity <= p.lowStockThreshold
  ) return { label: "Limited stock", tone: "amber" };
  if (p.bestseller) return { label: "Best seller", tone: "violet" };
  if (p.newArrival) return { label: "New arrival", tone: "neutral" };
  return null;
}

const pillClasses: Record<Pill["tone"], string> = {
  emerald: "text-emerald-300/85 bg-emerald-400/[0.06] border-emerald-400/15",
  sky: "text-white/65 bg-white/[0.035] border-white/10",
  amber: "text-white/65 bg-white/[0.035] border-white/10",
  violet: "text-white/65 bg-white/[0.035] border-white/10",
  neutral: "text-white/60 bg-white/[0.035] border-white/10",
};

// ---------------- Confidence labels (one per card, at most) ----------------

type ConfidenceKey =
  | "highly"     // strongest pick
  | "recommend"  // solid alternative
  | "premium"   // clear upgrade
  | "budget"    // clear savings
  | "top_rated"; // rating leader

type Confidence = { key: ConfidenceKey; label: string; reason: string };

const CONFIDENCE_META: Record<ConfidenceKey, { label: string; reason: string }> = {
  highly:    { label: "Highly Recommended",  reason: "Most customers choose this." },
  recommend: { label: "Recommended",         reason: "Excellent value for everyday use." },
  premium:   { label: "Best Premium Choice", reason: "Premium upgrade." },
  budget:    { label: "Budget Choice",       reason: "Lower price with similar features." },
  top_rated: { label: "Best Rated",          reason: "Best rated in this category." },
};

/**
 * Assign at most one confidence label per suggestion. Deterministic — driven
 * only by rating, reviews, sold count, price signals. Never fabricates.
 */
function buildConfidenceMap(
  list: Product[],
  priceOf: (p: Product) => number,
): Map<string, Confidence> {
  const out = new Map<string, Confidence>();
  if (list.length === 0) return out;

  const priced = list.filter((p) => (priceOf(p) || 0) > 0);
  const prices = priced.map((p) => priceOf(p));
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 0;

  // Highly Recommended — strongest overall combined signal.
  const strong = list
    .filter((p) => (p.rating || 0) >= 4.3 && (p.reviews || 0) >= 10)
    .sort((a, b) => {
      const sa = (a.rating || 0) * 20 + Math.log10(1 + (a.reviews || 0)) * 10 + Math.log10(1 + (a.soldCount || 0)) * 5;
      const sb = (b.rating || 0) * 20 + Math.log10(1 + (b.reviews || 0)) * 10 + Math.log10(1 + (b.soldCount || 0)) * 5;
      return sb - sa;
    })[0];
  if (strong) out.set(strong.slug, { key: "highly", ...CONFIDENCE_META.highly });

  // Budget Choice — cheapest with credible rating, meaningfully below median.
  if (priced.length >= 2 && minPrice > 0 && maxPrice > minPrice * 1.15) {
    const budget = priced
      .filter((p) => (p.rating || 0) >= 4 && !out.has(p.slug))
      .sort((a, b) => priceOf(a) - priceOf(b))[0];
    if (budget && priceOf(budget) <= minPrice * 1.05) {
      out.set(budget.slug, { key: "budget", ...CONFIDENCE_META.budget });
    }
  }

  // Best Premium Choice — priciest with strong rating; must clearly exceed median.
  if (priced.length >= 2 && maxPrice > minPrice * 1.25) {
    const premium = priced
      .filter((p) => (p.rating || 0) >= 4.4 && (p.reviews || 0) >= 10 && !out.has(p.slug))
      .sort((a, b) => priceOf(b) - priceOf(a))[0];
    if (premium && priceOf(premium) >= maxPrice * 0.95) {
      out.set(premium.slug, { key: "premium", ...CONFIDENCE_META.premium });
    }
  }

  // Best Rated — highest rating with credible reviews.
  const rated = list
    .filter((p) => (p.reviews || 0) >= 15 && !out.has(p.slug))
    .sort((a, b) => (b.rating || 0) - (a.rating || 0))[0];
  if (rated && (rated.rating || 0) >= 4.6) {
    out.set(rated.slug, { key: "top_rated", ...CONFIDENCE_META.top_rated });
  }

  // Recommended — fallback for the next strongest unlabeled card.
  const fallback = list.find((p) => !out.has(p.slug) && (p.rating || 0) >= 4);
  if (fallback) out.set(fallback.slug, { key: "recommend", ...CONFIDENCE_META.recommend });

  return out;
}

// ============================ Component ============================

export function PDPCompareSection({ currentProduct }: { currentProduct: Product }) {
  const { products } = useProducts();
  const { priceOf, shippingFeeOf, format } = useRegion();
  const { slugs, toggle, has, isFull, max } = useCompare();
  const navigate = useNavigate();
  const [navigating, setNavigating] = useState(false);
  const [sort, setSort] = useState<SortKey>(() => readSort());
  const [preview, setPreview] = useState<Product | null>(null);

  const currentSlug = currentProduct.slug;
  const currentPrice = priceOf(currentProduct) || 0;

  const suggestions = useMemo(() => {
    if (!products.length) return [] as Product[];
    const cur = currentProduct;
    const curCats = new Set([cur.category, ...(cur.categories ?? [])].filter(Boolean));
    return products
      .filter((p) => p.slug !== cur.slug && p.status !== "archived" && p.inStock !== false)
      .map((p) => {
        let score = 0;
        if (cur.brand && p.brand && p.brand === cur.brand) score += 4;
        if (cur.productType && p.productType && p.productType === cur.productType) score += 3;
        const pCats = [p.category, ...(p.categories ?? [])].filter(Boolean);
        if (pCats.some((c) => curCats.has(c))) score += 2;
        if (currentPrice > 0) {
          const diff = Math.abs((priceOf(p) || 0) - currentPrice) / currentPrice;
          if (diff <= 0.25) score += 1;
        }
        return { p, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, VISIBLE_LIMIT)
      .map((x) => x.p);
  }, [products, currentProduct, currentPrice, priceOf]);

  const sortedSuggestions = useMemo(() => {
    if (suggestions.length === 0) return suggestions;
    const arr = suggestions.slice();
    switch (sort) {
      case "price":
        arr.sort((a, b) => (priceOf(a) || 0) - (priceOf(b) || 0)); break;
      case "rating":
        arr.sort((a, b) => (b.rating || 0) - (a.rating || 0)); break;
      case "popular":
        arr.sort((a, b) => (b.soldCount || 0) + (b.reviews || 0) - ((a.soldCount || 0) + (a.reviews || 0))); break;
      case "new":
        arr.sort((a, b) => {
          const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return tb - ta;
        }); break;
    }
    return arr;
  }, [suggestions, sort, priceOf]);

  useEffect(() => {
    if (!has(currentSlug)) toggle(currentSlug);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSlug]);

  const selectedAlt = slugs.filter((s) => s !== currentSlug);
  const selectedNonCurrent = selectedAlt.length;
  const selectedCount = selectedNonCurrent + 1;
  const canCompare = selectedNonCurrent >= 1 && selectedCount >= 2;

  const confidenceMap = useMemo(
    () => buildConfidenceMap(sortedSuggestions, priceOf),
    [sortedSuggestions, priceOf],
  );

  const handleToggle = useCallback(
    (slug: string) => {
      if (slug === currentSlug) return;
      if (!has(slug) && isFull) {
        toast.message(`Maximum ${max} products`);
        return;
      }
      toggle(slug);
    },
    [currentSlug, has, isFull, max, toggle],
  );

  const handleCompare = () => {
    if (!canCompare || navigating) return;
    setNavigating(true);
    navigate({ to: "/compare" });
  };

  const handleSort = (v: SortKey) => { setSort(v); writeSort(v); };

  if (products.length === 0) return null;

  if (suggestions.length === 0) {
    return (
      <section
        className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mt-36 sm:mt-40"
        aria-labelledby="pdp-ymal-heading"
      >
        <h2 id="pdp-ymal-heading" className="text-[20px] sm:text-[22px] font-semibold tracking-tight text-foreground leading-tight">
          Similar Products
        </h2>
        <p className="mt-3 text-[13px] text-white/55">No similar products available right now.</p>
      </section>
    );
  }

  return (
    <section
      className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mt-36 sm:mt-40"
      data-pdp-compare
      aria-labelledby="pdp-ymal-heading"
    >
      <div className="mb-8 sm:mb-10">
        <h2 id="pdp-ymal-heading" className="text-[20px] sm:text-[22px] font-semibold tracking-tight text-foreground leading-tight">
          Similar Products
        </h2>
        <p className="mt-2 text-[13px] text-white/55 leading-relaxed">
          Curated alternatives you may prefer.
        </p>
      </div>

      {/* Sort tabs */}
      <div
        role="tablist"
        aria-label="Sort similar products"
        className="relative mb-6 -mx-4 sm:mx-0 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="flex items-center gap-1 px-4 sm:px-0 min-w-max border-b border-white/[0.06]">
          {SORT_TABS.map((t) => {
            const active = sort === t.value;
            return (
              <button
                key={t.value}
                role="tab"
                aria-selected={active}
                onClick={() => handleSort(t.value)}
                className={`relative px-3 py-2.5 text-[12.5px] font-medium tracking-wide transition-colors duration-150 min-h-[44px] focus-visible:outline-none focus-visible:text-foreground ${
                  active ? "text-foreground" : "text-white/50 hover:text-white/80"
                }`}
              >
                {t.label}
                {active && (
                  <motion.span
                    layoutId="pdp-similar-sort-underline"
                    className="absolute left-2 right-2 -bottom-px h-[1.5px] bg-accent rounded-full"
                    transition={{ duration: 0.15, ease: "easeOut" }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Carousel */}
      <div className="relative -mx-4 sm:mx-0">
        <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-4 bg-gradient-to-r from-background/95 to-transparent z-10" />
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-4 bg-gradient-to-l from-background/95 to-transparent z-10" />

        <ul
          className="flex overflow-x-auto gap-4 sm:gap-5 px-4 sm:px-1 pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          style={{ overscrollBehaviorX: "contain", WebkitOverflowScrolling: "touch" }}
        >
          <li className="shrink-0 w-[40%] min-[420px]:w-[36%] sm:w-[200px]">
            <RailItem
              product={currentProduct}
              pinned
              pill={pillFor(currentProduct, shippingFeeOf(currentProduct))}
              onPreview={() => setPreview(currentProduct)}
            />
          </li>
          {sortedSuggestions.map((p) => {
            const active = has(p.slug);
            const disabled = !active && isFull;
            const conf = confidenceMap.get(p.slug) ?? null;
            return (
              <li key={p.slug} className="shrink-0 w-[40%] min-[420px]:w-[36%] sm:w-[200px]">
                <RailItem
                  product={p}
                  active={active}
                  disabled={disabled}
                  pill={pillFor(p, shippingFeeOf(p))}
                  confidence={conf}
                  onToggle={() => handleToggle(p.slug)}
                  onPreview={() => setPreview(p)}
                />
              </li>
            );
          })}
          <div aria-hidden className="shrink-0 w-1" />
        </ul>
      </div>

      {sortedSuggestions.length >= VIEW_MORE_THRESHOLD && (
        <div className="mt-8 px-1">
          <Link
            to="/category/$slug"
            params={{ slug: currentProduct.category || "all" }}
            className="inline-flex items-center gap-1 text-[13px] text-white/60 hover:text-accent transition-colors duration-150"
          >
            View all similar products
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      )}

      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {selectedNonCurrent === 0
          ? "No alternatives selected for comparison."
          : `${selectedCount} products selected for comparison.`}
      </div>

      {/* Shopping guidance + CTA summary */}
      <div className="mt-10 rounded-2xl border border-white/[0.06] bg-white/[0.015] p-5 sm:p-6">
        <p className="text-[12.5px] leading-relaxed text-white/60">
          {canCompare
            ? "Ready to compare your selected products."
            : "Compare up to 4 similar products to see differences in price, ratings and specifications."}
        </p>
        <div className="mt-4 flex items-center justify-between gap-4">
          <span className={`text-[12.5px] tabular-nums ${canCompare ? "text-foreground/85" : "text-white/40"}`}>
            {selectedNonCurrent === 0
              ? "Select at least 2 products"
              : `${selectedCount} products selected`}
          </span>
          <button
            type="button"
            disabled={!canCompare || navigating}
            onClick={handleCompare}
            aria-label={canCompare ? "Compare selected products" : "Select one more product to compare"}
            className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-[12.5px] font-semibold tracking-wide transition-colors duration-150 ease-out min-h-[40px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
              canCompare && !navigating
                ? "border-accent bg-accent text-accent-foreground hover:brightness-110"
                : "border-white/10 bg-white/[0.02] text-white/30 cursor-not-allowed"
            }`}
          >
            {navigating ? (
              <><Loader2 className="size-3.5 animate-spin" aria-hidden /> Opening</>
            ) : (
              <>Compare Products <ArrowRight className="size-3.5" aria-hidden /></>
            )}
          </button>
        </div>
      </div>

      <QuickPreviewSheet
        product={preview}
        onClose={() => setPreview(null)}
        pill={preview ? pillFor(preview, shippingFeeOf(preview)) : null}
        onToggle={(slug) => handleToggle(slug)}
        isSelected={preview ? preview.slug === currentSlug || has(preview.slug) : false}
        isPinned={preview ? preview.slug === currentSlug : false}
      />
    </section>
  );
}

// ============================ Card ============================

type RailItemProps = {
  product: Product;
  active?: boolean;
  disabled?: boolean;
  pinned?: boolean;
  pill?: Pill | null;
  confidence?: Confidence | null;
  onToggle?: () => void;
  onPreview?: () => void;
};

function RailItemImpl({
  product,
  active,
  disabled,
  pinned,
  pill,
  confidence,
  onToggle,
  onPreview,
}: RailItemProps) {
  const { priceOf, format } = useRegion();
  const { toggle: toggleWishlist } = useWishlistActions();
  const saved = useWishlistSaved(product.slug);
  const isSelected = !!(pinned || active);

  const price = priceOf(product) || 0;
  const originalRaw =
    (product.comparePriceInr && product.comparePriceInr > price ? product.comparePriceInr : null) ??
    (product.comparePriceUsd && product.comparePriceUsd > price ? product.comparePriceUsd : null);
  const discountPct = originalRaw && originalRaw > price
    ? Math.round(((originalRaw - price) / originalRaw) * 100) : 0;

  // Header caption: Current > confidence label. Never both, never orange for Current.
  const caption: { label: string; tone: "muted" | "accent" } | null =
    pinned ? { label: "Current", tone: "muted" }
    : confidence ? { label: confidence.label, tone: "accent" }
    : null;

  return (
    <div className="flex h-full flex-col">
      {/* Reserved caption slot */}
      <div className="mb-2.5 h-[14px] px-0.5 flex items-center">
        {caption && (
          <span
            className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${
              caption.tone === "accent" ? "text-amber-300/90" : "text-white/40"
            }`}
          >
            {caption.label}
          </span>
        )}
      </div>

      <div
        className={`relative flex flex-1 flex-col rounded-2xl border bg-white/[0.015] transition-[border-color,box-shadow] duration-150 ease-out ${
          isSelected && !pinned
            ? "border-accent/70 shadow-[0_0_0_1px_rgba(245,158,11,0.12),0_8px_24px_-16px_rgba(245,158,11,0.35)]"
            : "border-white/[0.06]"
        }`}
      >
        {/* Image = primary interaction → open Quick Preview */}
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onPreview?.(); }}
          aria-label={`Quick preview: ${product.name}`}
          className="relative block w-full overflow-hidden rounded-t-2xl bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          <div className="aspect-square w-full">
            {product.image && (
              <img
                src={resolveImage(product.image)}
                alt={product.name}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover transition-opacity duration-150"
              />
            )}
          </div>
          {discountPct >= 5 && !pinned && (
            <span className="absolute left-2 top-2 rounded-full bg-black/60 backdrop-blur px-1.5 py-[2px] text-[10px] font-semibold text-white/90 tabular-nums">
              −{discountPct}%
            </span>
          )}
        </button>

        {/* Wishlist — top right of image */}
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleWishlist(product.slug); }}
          aria-label={saved ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
          aria-pressed={saved}
          className={`absolute right-2 top-2 grid size-8 place-items-center rounded-full border backdrop-blur transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
            saved
              ? "border-accent/50 bg-black/50 text-accent"
              : "border-white/15 bg-black/40 text-white/75 hover:text-foreground hover:border-white/30"
          }`}
        >
          <Heart className={`size-3.5 ${saved ? "fill-accent" : ""}`} aria-hidden />
        </button>

        {/* Content */}
        <div className="flex flex-1 flex-col px-3.5 pt-4 pb-3">

          <Link
            to="/products/$slug"
            params={{ slug: product.slug }}
            className="line-clamp-2 min-h-[34px] text-[12.5px] leading-[1.35] text-foreground/90 hover:text-accent transition-colors duration-150"
          >
            {product.name}
          </Link>

          {/* Rating */}
          <div className="mt-2 flex h-[14px] items-center gap-1 text-[11px] text-white/55">
            {product.rating > 0 ? (
              <>
                <Star className="size-3 fill-amber-400 text-amber-400" aria-hidden />
                <span className="tabular-nums text-white/75">{product.rating.toFixed(1)}</span>
                <span className="tabular-nums text-white/40">({product.reviews ?? 0})</span>
              </>
            ) : (
              <span className="text-white/35">New</span>
            )}
          </div>

          {/* Price */}
          <div className="mt-3 min-h-[36px]">
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span className="text-[14.5px] font-semibold text-foreground tabular-nums">
                {format(price)}
              </span>
              {originalRaw ? (
                <span className="text-[11px] text-white/40 line-through tabular-nums">
                  {format(originalRaw)}
                </span>
              ) : null}
              {discountPct >= 5 && (
                <span className="text-[10.5px] font-medium text-emerald-300/85 tabular-nums">
                  −{discountPct}%
                </span>
              )}
            </div>
          </div>

          {/* Pill */}
          <div className="mt-2 flex h-[20px] items-center">
            {pill && (
              <span className={`inline-flex items-center rounded-full border px-1.5 py-[1px] text-[10px] font-medium tracking-wide ${pillClasses[pill.tone]}`}>
                {pill.label}
              </span>
            )}
          </div>

          {/* Recommendation sentence — reserved (12–16px gap before selector) */}
          <div className="mt-2.5 mb-3 min-h-[16px]">
            {confidence && (
              <p className="text-[10.5px] leading-snug text-white/60 line-clamp-1">
                {confidence.reason}
              </p>
            )}
          </div>
        </div>

        {/* Compare selector — lightweight row, whole area clickable */}
        <div className="mt-auto border-t border-white/[0.05]">
          <button
            type="button"
            onClick={onToggle}
            aria-pressed={isSelected}
            aria-label={
              pinned
                ? `${product.name} is the current product`
                : isSelected
                  ? `Remove ${product.name} from comparison`
                  : `Select ${product.name} for comparison`
            }
            disabled={pinned || disabled}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 px-3.5 py-2.5 rounded-b-2xl transition-colors duration-150 ease-out disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-inset hover:bg-white/[0.02] disabled:hover:bg-transparent"
          >
            <span
              aria-hidden
              className={`grid place-items-center size-[18px] rounded-full border transition-colors duration-150 ease-out ${
                pinned
                  ? "border-white/15 bg-transparent"
                  : isSelected
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-white/30 bg-transparent"
              }`}
            >
              {isSelected && !pinned && <Check className="size-2.5" strokeWidth={3} />}
            </span>
            <span
              className={`text-[14px] font-medium leading-none whitespace-nowrap transition-colors duration-150 ease-out ${
                pinned
                  ? "text-white/35"
                  : isSelected
                    ? "text-accent"
                    : "text-white/60"
              }`}
            >
              {pinned ? "Current" : isSelected ? "Selected" : "Compare"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}


const RailItem = memo(RailItemImpl);

// ============================ Quick Preview ============================

function QuickPreviewSheet({
  product,
  onClose,
  pill,
  onToggle,
  isSelected,
  isPinned,
}: {
  product: Product | null;
  onClose: () => void;
  pill: Pill | null;
  onToggle: (slug: string) => void;
  isSelected: boolean;
  isPinned: boolean;
}) {
  const { priceOf, format } = useRegion();
  const { add } = useCartActions();
  const buyNow = useBuyNow();
  const scrollRef = useRef<number>(0);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (product) {
      scrollRef.current = typeof window !== "undefined" ? window.scrollY : 0;
    } else if (typeof window !== "undefined" && scrollRef.current > 0) {
      window.scrollTo({ top: scrollRef.current });
    }
  }, [product]);

  if (!product) return null;

  const price = priceOf(product) || 0;
  const compareInr = product.comparePriceInr;
  const compareUsd = product.comparePriceUsd;
  const originalRaw =
    (compareInr && compareInr > price ? compareInr : null) ??
    (compareUsd && compareUsd > price ? compareUsd : null);
  const discountPct = originalRaw && originalRaw > price
    ? Math.round(((originalRaw - price) / originalRaw) * 100) : 0;

  const specEntries = Object.entries(product.specifications ?? {}).slice(0, 6);
  const inStock = product.inStock !== false && product.stockQuantity > 0;
  const lowStock = inStock && product.lowStockThreshold > 0 && product.stockQuantity <= product.lowStockThreshold;

  const handleAdd = async () => {
    if (!inStock || adding) return;
    setAdding(true);
    try {
      await add(product.slug, 1);
      toast.success("Added to cart", { description: product.name });
    } finally {
      setTimeout(() => setAdding(false), 400);
    }
  };

  const handleBuyNow = () => {
    onClose();
    buyNow(product, { disabled: !inStock });
  };

  return (
    <Sheet open={!!product} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="bottom"
        className="p-0 border-t border-white/[0.06] rounded-t-2xl max-h-[90dvh] overflow-hidden"
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-white/15" aria-hidden />
        <div className="overflow-y-auto max-h-[calc(90dvh-1rem)] px-5 pb-6 pt-3">
          {/* Large image */}
          <div className="mt-1 rounded-xl overflow-hidden bg-white/[0.03] border border-white/[0.05]">
            <img
              src={resolveImage(product.image)}
              alt={product.name}
              loading="lazy"
              className="w-full aspect-square object-cover"
            />
          </div>

          <h3 className="mt-5 text-[16px] font-semibold tracking-tight text-foreground leading-snug">
            {product.name}
          </h3>

          {product.rating > 0 && (
            <div className="mt-2 flex items-center gap-1.5 text-[12px] text-white/60">
              <Star className="size-3.5 fill-amber-400 text-amber-400" aria-hidden />
              <span className="tabular-nums">{product.rating.toFixed(1)}</span>
              <span className="text-white/40">·</span>
              <span className="tabular-nums">{product.reviews ?? 0} reviews</span>
            </div>
          )}

          <div className="mt-3.5 flex items-baseline gap-2.5 flex-wrap">
            <span className="text-[19px] font-semibold text-foreground tabular-nums">
              {format(price)}
            </span>
            {originalRaw && (
              <>
                <span className="text-[12.5px] text-white/40 line-through tabular-nums">
                  {format(originalRaw)}
                </span>
                {discountPct >= 5 && (
                  <span className="text-[11.5px] font-medium text-emerald-300/85 tabular-nums">
                    Save {format(originalRaw - price)} · −{discountPct}%
                  </span>
                )}
              </>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {pill && (
              <span className={`inline-flex items-center rounded-full border px-2 py-[2px] text-[10.5px] font-medium tracking-wide ${pillClasses[pill.tone]}`}>
                {pill.label}
              </span>
            )}
            <span className={`text-[11.5px] tabular-nums ${
              !inStock ? "text-red-300/80" : lowStock ? "text-amber-300/85" : "text-emerald-300/85"
            }`}>
              {!inStock
                ? "Currently unavailable"
                : lowStock
                  ? `Only ${product.stockQuantity} left`
                  : "In stock"}
            </span>
          </div>

          {specEntries.length > 0 && (
            <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-white/[0.05] pt-4">
              {specEntries.map(([k, v]) => (
                <div key={k} className="min-w-0 text-[12px]">
                  <dt className="text-white/45 truncate">{k}</dt>
                  <dd className="text-white/85 truncate">{v}</dd>
                </div>
              ))}
            </dl>
          )}

          {/* Compare toggle */}
          {!isPinned && (
            <button
              type="button"
              onClick={() => onToggle(product.slug)}
              aria-pressed={isSelected}
              className={`mt-5 inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[12px] transition-colors duration-150 ease-out min-h-[38px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
                isSelected
                  ? "border-accent/70 text-accent"
                  : "border-white/15 text-white/80 hover:border-white/25 hover:text-foreground"
              }`}
            >
              <span
                aria-hidden
                className={`grid place-items-center size-3.5 rounded-[3.5px] border transition-colors duration-150 ${
                  isSelected ? "border-accent bg-accent text-accent-foreground" : "border-white/25"
                }`}
              >
                {isSelected && <Check className="size-2.5" strokeWidth={3} />}
              </span>
              {isSelected ? "Selected for comparison" : "Add to comparison"}
            </button>
          )}

          {/* Primary actions */}
          <div className="mt-5 grid grid-cols-2 gap-2.5">
            <button
              type="button"
              disabled={!inStock || adding}
              onClick={handleAdd}
              className="inline-flex items-center justify-center gap-1.5 rounded-full border border-white/15 bg-transparent px-4 h-[44px] text-[12.5px] font-medium text-foreground/90 transition-colors duration-150 ease-out hover:border-white/30 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            >
              {adding ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "Add to Cart"}
            </button>
            <button
              type="button"
              disabled={!inStock}
              onClick={handleBuyNow}
              className="inline-flex items-center justify-center gap-1.5 rounded-full bg-accent text-accent-foreground px-4 h-[44px] text-[12.5px] font-semibold transition-[filter] duration-150 ease-out hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            >
              <Zap className="size-3.5" aria-hidden strokeWidth={2.5} />
              Buy Now
            </button>
          </div>

          <Link
            to="/products/$slug"
            params={{ slug: product.slug }}
            onClick={onClose}
            className="mt-3 inline-flex w-full items-center justify-center gap-1.5 text-[11.5px] font-medium tracking-wide text-white/60 hover:text-accent transition-colors duration-150"
          >
            View full product
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
