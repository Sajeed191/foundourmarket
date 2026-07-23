import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Check, Eye, Loader2, ShoppingBag, Star, X } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";

import { useProducts } from "@/lib/use-products";
import { resolveImage, type Product } from "@/lib/products";
import { useRegion } from "@/lib/region";
import { useCompare } from "@/hooks/use-compare";
import { useCartActions, useCartQty } from "@/lib/cart";
import { Sheet, SheetContent } from "@/components/ui/sheet";

/**
 * PDP — Similar Products (v6.5 · Decision Assistant)
 *
 * Adds a single data-backed recommendation, a preview-selection state, a
 * factual decision helper above the CTA, and a "View Product" primary action
 * inside the Quick Preview. No engine, backend, or UI-system changes.
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
  } catch {
    /* noop */
  }
  return "best";
}

function writeSort(v: SortKey) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SORT_STORAGE_KEY, v);
  } catch {
    /* noop */
  }
}

type Pill = { label: string; tone: "emerald" | "sky" | "amber" | "violet" | "neutral" };

function pillFor(p: Product, shipping: number): Pill | null {
  // Priority: Free Delivery > Fast Delivery > Limited Stock > Best Seller > New Arrival
  if (shipping === 0) return { label: "Free delivery", tone: "emerald" };
  if (p.fastSelling) return { label: "Fast delivery", tone: "sky" };
  if (
    p.inStock !== false &&
    p.stockQuantity > 0 &&
    p.lowStockThreshold > 0 &&
    p.stockQuantity <= p.lowStockThreshold
  ) {
    return { label: "Limited stock", tone: "amber" };
  }
  if (p.bestseller) return { label: "Best seller", tone: "violet" };
  if (p.newArrival) return { label: "New arrival", tone: "neutral" };
  return null;
}

// Quieter, near-neutral pill palette. Only Free Delivery keeps a subtle
// accent — everything else is neutral so a single card never dominates.
const pillClasses: Record<Pill["tone"], string> = {
  emerald: "text-emerald-300/85 bg-emerald-400/[0.06] border-emerald-400/15",
  sky: "text-white/65 bg-white/[0.035] border-white/10",
  amber: "text-white/65 bg-white/[0.035] border-white/10",
  violet: "text-white/65 bg-white/[0.035] border-white/10",
  neutral: "text-white/60 bg-white/[0.035] border-white/10",
};

type Recommendation = {
  slug: string;
  badge: "Recommended" | "Best Value" | "Most Popular" | "Highest Rated" | "Best Seller";
  reason: string;
};

/**
 * Pick ONE recommended product from the visible list using deterministic,
 * data-backed rules. Never fabricates. Returns null when no signal is strong
 * enough. Priority reflects customer decision value:
 *   Best Value → Most Popular → Highest Rated → Best Seller → Recommended.
 */
function pickRecommendation(
  list: Product[],
  priceOf: (p: Product) => number,
): Recommendation | null {
  if (list.length < 2) return null;

  const withPrice = list.filter((p) => (priceOf(p) || 0) > 0);

  // Best Value: rating >= 4.3, meaningful review base, best rating-per-price.
  const valueCandidates = withPrice.filter(
    (p) => (p.rating || 0) >= 4.3 && (p.reviews || 0) >= 10,
  );
  if (valueCandidates.length > 0) {
    const best = valueCandidates
      .slice()
      .sort((a, b) => (b.rating || 0) / priceOf(b) - (a.rating || 0) / priceOf(a))[0];
    if (best) {
      return { slug: best.slug, badge: "Best Value", reason: "Best value for the price." };
    }
  }

  // Most Popular: leader in sold + reviews with a meaningful floor.
  const popular = list
    .slice()
    .sort(
      (a, b) =>
        (b.soldCount || 0) + (b.reviews || 0) - ((a.soldCount || 0) + (a.reviews || 0)),
    )[0];
  if (popular && (popular.soldCount || 0) + (popular.reviews || 0) >= 50) {
    return {
      slug: popular.slug,
      badge: "Most Popular",
      reason: "Most customers choose this option.",
    };
  }

  // Highest Rated: top rating with credible review count.
  const rated = list
    .filter((p) => (p.reviews || 0) >= 10)
    .sort((a, b) => (b.rating || 0) - (a.rating || 0))[0];
  if (rated && (rated.rating || 0) >= 4.5) {
    return {
      slug: rated.slug,
      badge: "Highest Rated",
      reason: "Highest rated among similar products.",
    };
  }

  // Best Seller: explicit bestseller flag.
  const seller = list.find((p) => p.bestseller);
  if (seller) {
    return {
      slug: seller.slug,
      badge: "Best Seller",
      reason: "A best-selling option in this category.",
    };
  }

  // Fallback Recommended: top-ranked match with a decent rating.
  const first = list[0];
  if (first && (first.rating || 0) >= 4) {
    return {
      slug: first.slug,
      badge: "Recommended",
      reason: "Best balance of price and rating.",
    };
  }

  return null;
}

/**
 * Build ONE factual decision helper comparing a selected alternative to the
 * current product. Priority: price < rating < reviews < discount.
 */
function buildDecisionHelper(
  alt: Product,
  current: Product,
  priceOf: (p: Product) => number,
): string | null {
  const ap = priceOf(alt) || 0;
  const cp = priceOf(current) || 0;
  if (ap > 0 && cp > 0 && ap < cp) {
    return "This product costs less than your current selection.";
  }
  if ((alt.rating || 0) >= (current.rating || 0) + 0.3 && (alt.reviews || 0) >= 5) {
    return "This product has a higher customer rating.";
  }
  if ((alt.reviews || 0) >= (current.reviews || 0) * 1.5 && (alt.reviews || 0) >= 20) {
    return "This product has more verified reviews.";
  }
  const discPct = (p: Product) => {
    const price = priceOf(p) || 0;
    const orig =
      (p.comparePriceInr && p.comparePriceInr > price ? p.comparePriceInr : null) ??
      (p.comparePriceUsd && p.comparePriceUsd > price ? p.comparePriceUsd : null);
    if (!orig || orig <= 0 || price <= 0) return 0;
    return (orig - price) / orig;
  };
  if (discPct(alt) > discPct(current) + 0.05) {
    return "This product offers a better discount.";
  }
  return null;
}



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

  // --- Similarity (unchanged algorithm) ---
  const suggestions = useMemo(() => {
    if (!products.length) return [] as Product[];
    const cur = currentProduct;
    const curCats = new Set(
      [cur.category, ...(cur.categories ?? [])].filter(Boolean),
    );

    return products
      .filter(
        (p) =>
          p.slug !== cur.slug &&
          p.status !== "archived" &&
          p.inStock !== false,
      )
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

  // --- Client-side sort (reorders in place, no new fetch) ---
  const sortedSuggestions = useMemo(() => {
    if (suggestions.length === 0) return suggestions;
    const arr = suggestions.slice();
    switch (sort) {
      case "price":
        arr.sort((a, b) => (priceOf(a) || 0) - (priceOf(b) || 0));
        break;
      case "rating":
        arr.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        break;
      case "popular":
        arr.sort(
          (a, b) =>
            (b.soldCount || 0) + (b.reviews || 0) - ((a.soldCount || 0) + (a.reviews || 0)),
        );
        break;
      case "new":
        arr.sort((a, b) => {
          const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return tb - ta;
        });
        break;
      case "best":
      default:
        // already ranked by score
        break;
    }
    return arr;
  }, [suggestions, sort, priceOf]);

  useEffect(() => {
    if (!has(currentSlug)) toggle(currentSlug);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSlug]);

  const selectedAlt = slugs.filter((s) => s !== currentSlug);
  const selectedNonCurrent = selectedAlt.length;
  const selectedCount = selectedNonCurrent + 1; // + current
  const canCompare = selectedNonCurrent >= 1 && selectedCount >= 2;

  // --- Smart Savings Summary ---
  const savings = useMemo(() => {
    if (selectedAlt.length === 0 || currentPrice <= 0) return 0;
    const prices = selectedAlt
      .map((s) => suggestions.find((p) => p.slug === s))
      .filter((p): p is Product => !!p)
      .map((p) => priceOf(p) || 0)
      .filter((n) => n > 0);
    if (prices.length === 0) return 0;
    const cheapest = Math.min(...prices);
    const diff = currentPrice - cheapest;
    // Hide when savings are negligible (< 2% of current price and < a meaningful floor).
    if (diff <= 0) return 0;
    if (diff / currentPrice < 0.02) return 0;
    return diff;
  }, [selectedAlt, suggestions, priceOf, currentPrice]);

  // --- Single data-backed recommendation across the carousel ---
  const recommendation = useMemo(
    () => pickRecommendation(sortedSuggestions, priceOf),
    [sortedSuggestions, priceOf],
  );

  // --- Decision helper (factual, based on first selected alternative) ---
  const decisionMessage = useMemo(() => {
    const firstAltSlug = selectedAlt[0];
    if (!firstAltSlug) return null;
    const alt = suggestions.find((p) => p.slug === firstAltSlug);
    if (!alt) return null;
    return buildDecisionHelper(alt, currentProduct, priceOf);
  }, [selectedAlt, suggestions, currentProduct, priceOf]);

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

  const handleSort = (v: SortKey) => {
    setSort(v);
    writeSort(v);
  };

  const previewSlug = preview?.slug ?? null;


  if (products.length === 0) return null;

  // Empty state — no similar products
  if (suggestions.length === 0) {
    return (
      <section
        className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mt-36 sm:mt-40"
        aria-labelledby="pdp-ymal-heading"
      >
        <h2
          id="pdp-ymal-heading"
          className="text-[20px] sm:text-[22px] font-semibold tracking-tight text-foreground leading-tight"
        >
          Similar Products
        </h2>
        <p className="mt-3 text-[13px] text-white/55">
          No similar products available right now.
        </p>
      </section>
    );
  }

  return (
    <section
      className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mt-36 sm:mt-40"
      data-pdp-compare
      aria-labelledby="pdp-ymal-heading"
    >
      <div className="mb-7 sm:mb-8">
        <h2
          id="pdp-ymal-heading"
          className="text-[20px] sm:text-[22px] font-semibold tracking-tight text-foreground leading-tight"
        >
          Similar Products
        </h2>
        <p className="mt-2 text-[13px] text-white/55 leading-relaxed">
          More options you may like.
        </p>
      </div>

      {/* Sort tabs */}
      <div
        role="tablist"
        aria-label="Sort similar products"
        className="relative mb-5 -mx-4 sm:mx-0 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
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
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="relative -mx-4 sm:mx-0">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-4 bg-gradient-to-r from-background/95 to-transparent z-10"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-4 bg-gradient-to-l from-background/95 to-transparent z-10"
        />

        <ul
          className="flex overflow-x-auto gap-5 sm:gap-6 px-4 sm:px-1 pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          style={{
            overscrollBehaviorX: "contain",
            WebkitOverflowScrolling: "touch",
          }}
        >
          <li className="shrink-0 w-[42%] min-[420px]:w-[38%] sm:w-[210px]">
            <RailItem
              product={currentProduct}
              pinned
              pill={pillFor(currentProduct, shippingFeeOf(currentProduct))}
              onPreview={() => setPreview(currentProduct)}
              previewSelected={previewSlug === currentProduct.slug}
            />
          </li>
          {sortedSuggestions.map((p) => {
            const active = has(p.slug);
            const disabled = !active && isFull;
            const isRecommended = recommendation?.slug === p.slug;
            return (
              <li
                key={p.slug}
                className="shrink-0 w-[42%] min-[420px]:w-[38%] sm:w-[210px]"
              >
                <RailItem
                  product={p}
                  active={active}
                  disabled={disabled}
                  pill={pillFor(p, shippingFeeOf(p))}
                  onToggle={() => handleToggle(p.slug)}
                  onPreview={() => setPreview(p)}
                  previewSelected={previewSlug === p.slug}
                  recommendedBadge={isRecommended ? recommendation!.badge : null}
                  recommendedReason={isRecommended ? recommendation!.reason : null}
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

      <div
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {selectedNonCurrent === 0
          ? "No alternatives selected for comparison."
          : `${selectedCount} products selected for comparison.`}
      </div>

      {savings > 0 && (
        <p className="mt-8 text-[12.5px] text-emerald-300/85 px-1 tabular-nums">
          You could save {format(savings)} by choosing one of these alternatives.
        </p>
      )}

      {/* Decision helper — hidden once user is ready to compare */}
      {!canCompare && (
        <div className="mt-8 px-1">
          <p className="text-[12.5px] font-medium text-foreground/85">
            Need help choosing?
          </p>
          <p className="mt-1 text-[12px] text-white/55 leading-relaxed">
            Compare specifications, ratings and price side by side before you buy.
          </p>
        </div>
      )}
      {canCompare && decisionMessage && (
        <p className="mt-8 text-[12.5px] text-white/70 px-1">{decisionMessage}</p>
      )}

      {/* CTA row */}
      <div className="mt-5 pt-6 border-t border-white/[0.05] px-1">
        <div className="flex items-center justify-between gap-4">
          <span className={`text-[12.5px] tabular-nums ${canCompare ? "text-white/70" : "text-white/40"}`}>
            {selectedNonCurrent === 0
              ? "Select at least 2 products"
              : `${selectedCount} products selected`}
          </span>
          <button
            type="button"
            disabled={!canCompare || navigating}
            onClick={handleCompare}
            aria-label={
              canCompare
                ? "Compare selected products"
                : "Select one more product to compare"
            }
            className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-[12.5px] font-semibold tracking-wide transition-colors duration-150 ease-out min-h-[40px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
              canCompare && !navigating
                ? "border-accent bg-accent text-accent-foreground hover:brightness-110"
                : "border-white/10 bg-white/[0.02] text-white/30 cursor-not-allowed"
            }`}
          >
            {navigating ? (
              <>
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
                Opening
              </>
            ) : (
              <>
                Compare Products
                <ArrowRight className="size-3.5" aria-hidden />
              </>
            )}
          </button>
        </div>
      </div>


      <QuickPreviewSheet
        product={preview}
        onClose={() => setPreview(null)}
        pillClasses={pillClasses}
        pill={preview ? pillFor(preview, shippingFeeOf(preview)) : null}
        onToggle={(slug) => handleToggle(slug)}
        isSelected={preview ? preview.slug === currentSlug || has(preview.slug) : false}
        isPinned={preview ? preview.slug === currentSlug : false}
      />
    </section>
  );
}

type RailItemProps = {
  product: Product;
  active?: boolean;
  disabled?: boolean;
  pinned?: boolean;
  pill?: Pill | null;
  onToggle?: () => void;
  onPreview?: () => void;
  previewSelected?: boolean;
  recommendedBadge?: Recommendation["badge"] | null;
  recommendedReason?: string | null;
};

function RailItemImpl({
  product,
  active,
  disabled,
  pinned,
  pill,
  onToggle,
  onPreview,
  previewSelected,
  recommendedBadge,
  recommendedReason,
}: RailItemProps) {
  const { priceOf, format } = useRegion();
  const { add } = useCartActions();
  const inCart = useCartQty(product.slug) > 0;
  const isSelected = !!(pinned || active);

  const price = priceOf(product) || 0;
  const originalRaw =
    (product.comparePriceInr && product.comparePriceInr > price ? product.comparePriceInr : null) ??
    (product.comparePriceUsd && product.comparePriceUsd > price ? product.comparePriceUsd : null);
  const discountPct =
    originalRaw && originalRaw > price
      ? Math.round(((originalRaw - price) / originalRaw) * 100)
      : 0;
  const savings = originalRaw && originalRaw > price ? originalRaw - price : 0;

  // Caption slot priority: Current > Selected > Recommended.
  let caption: { label: string; tone: "muted" | "accent" | "recommend" } | null = null;
  if (pinned) caption = { label: "Current", tone: "muted" };
  else if (previewSelected || active) caption = { label: "Selected", tone: "accent" };
  else if (recommendedBadge) caption = { label: recommendedBadge, tone: "recommend" };

  const captionClass =
    caption?.tone === "accent"
      ? "text-accent"
      : caption?.tone === "recommend"
        ? "text-amber-300/90"
        : "text-white/40";

  // Selection styling: subtle accent border + soft glow. No scale/bounce.
  const cardBorder = pinned
    ? "border-white/[0.07]"
    : isSelected
      ? "border-accent/70 shadow-[0_0_0_1px_rgba(255,153,51,0.18),0_8px_24px_-12px_rgba(255,153,51,0.35)]"
      : "border-white/[0.06] hover:border-white/[0.14]";

  const handleAddToCart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!product.inStock) return;
      add(product.slug, 1);
      toast.success("Added to cart", { description: product.name });
    },
    [add, product.slug, product.name, product.inStock],
  );

  return (
    <div className="flex h-full flex-col">
      {/* Reserved caption slot so cards align regardless of tag */}
      <div className="mb-2 h-[14px] px-0.5 flex items-center">
        {caption && (
          <span
            className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${captionClass}`}
          >
            {caption.label}
          </span>
        )}
      </div>

      <div
        className={`relative flex flex-1 flex-col rounded-2xl border bg-white/[0.015] transition-colors duration-150 ease-out ${cardBorder}`}
      >
        {/* Image slot — fixed square, tap for preview */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onPreview?.();
          }}
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

        {/* Content slot — fixed rhythm */}
        <div className="flex flex-1 flex-col px-3 pt-3 pb-3">
          {/* Title — reserved 2 lines */}
          <Link
            to="/products/$slug"
            params={{ slug: product.slug }}
            className="line-clamp-2 min-h-[34px] text-[12.5px] leading-[1.35] text-foreground/90 hover:text-accent transition-colors duration-150"
          >
            {product.name}
          </Link>

          {/* Rating — reserved slot */}
          <div className="mt-1.5 flex h-[14px] items-center gap-1 text-[11px] text-white/55">
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

          {/* Price — original + save */}
          <div className="mt-2 min-h-[36px]">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[14px] font-semibold text-foreground tabular-nums">
                {format(price)}
              </span>
              {originalRaw ? (
                <span className="text-[11px] text-white/40 line-through tabular-nums">
                  {format(originalRaw)}
                </span>
              ) : null}
            </div>
            {savings > 0 ? (
              <div className="mt-0.5 text-[10.5px] font-medium text-emerald-300/85 tabular-nums">
                Save {format(savings)}
              </div>
            ) : (
              <div className="mt-0.5 h-[13px]" aria-hidden />
            )}
          </div>

          {/* Delivery / metadata pill — reserved slot */}
          <div className="mt-1 flex h-[20px] items-center">
            {pill && (
              <span
                className={`inline-flex items-center rounded-full border px-1.5 py-[1px] text-[10px] font-medium tracking-wide ${pillClasses[pill.tone]}`}
              >
                {pill.label}
              </span>
            )}
          </div>

          {/* Recommendation reason — reserved (2 lines) so cards align */}
          <div className="mt-1.5 min-h-[26px]">
            {recommendedReason && (
              <p className="text-[10.5px] leading-snug text-white/60 line-clamp-2">
                {recommendedReason}
              </p>
            )}
          </div>

          {/* Compact action row — icon buttons, never dominates */}
          <div className="mt-3 flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleAddToCart}
              disabled={!product.inStock}
              aria-label={inCart ? `${product.name} added to cart` : `Add ${product.name} to cart`}
              className={`inline-flex h-[38px] flex-1 items-center justify-center gap-1.5 rounded-full border text-[11.5px] font-medium tracking-wide transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-not-allowed disabled:opacity-40 ${
                inCart
                  ? "border-emerald-400/40 bg-emerald-400/[0.06] text-emerald-200"
                  : "border-white/12 bg-transparent text-white/80 hover:border-accent/50 hover:text-accent"
              }`}
            >
              {inCart ? (
                <>
                  <Check className="size-3.5" aria-hidden />
                  Added
                </>
              ) : (
                <>
                  <ShoppingBag className="size-3.5" aria-hidden />
                  Cart
                </>
              )}
            </button>
            {onPreview && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onPreview();
                }}
                aria-label={`Preview ${product.name}`}
                className="inline-flex h-[38px] w-[38px] items-center justify-center rounded-full border border-white/12 text-white/70 transition-colors duration-150 ease-out hover:border-white/25 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
              >
                <Eye className="size-3.5" aria-hidden />
              </button>
            )}
          </div>

          {/* Selectable state — clear, full-width */}
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
            className={`mt-1.5 inline-flex h-[38px] w-full items-center justify-center gap-1.5 rounded-full text-[11.5px] font-medium tracking-wide transition-colors duration-150 ease-out disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
              pinned
                ? "text-white/35"
                : isSelected
                  ? "bg-accent/[0.09] text-accent"
                  : "text-white/60 hover:text-white/90"
            }`}
          >
            <span
              aria-hidden
              className={`grid place-items-center size-4 rounded-[4px] border transition-colors duration-150 ${
                isSelected
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-white/25 bg-transparent"
              }`}
            >
              {isSelected && <Check className="size-2.5" strokeWidth={3} />}
            </span>
            {pinned
              ? "Current product"
              : isSelected
                ? "Selected for Comparison"
                : "Compare"}
          </button>
        </div>
      </div>
    </div>
  );
}

const RailItem = memo(RailItemImpl);

// ---------------- Quick Preview Bottom Sheet ----------------

function QuickPreviewSheet({
  product,
  onClose,
  pillClasses,
  pill,
  onToggle,
  isSelected,
  isPinned,
}: {
  product: Product | null;
  onClose: () => void;
  pillClasses: Record<Pill["tone"], string>;
  pill: Pill | null;
  onToggle: (slug: string) => void;
  isSelected: boolean;
  isPinned: boolean;
}) {
  const { priceOf, format } = useRegion();
  const scrollRef = useRef<number>(0);

  // Preserve carousel scroll position across open/close.
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

  const specEntries = Object.entries(product.specifications ?? {}).slice(0, 5);

  return (
    <Sheet open={!!product} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="bottom"
        className="p-0 border-t border-white/[0.06] rounded-t-2xl max-h-[88dvh] overflow-hidden"
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-white/15" aria-hidden />
        <div className="overflow-y-auto max-h-[calc(88dvh-1rem)] px-5 pb-6 pt-3">
          {/* Header row for close is handled by SheetContent's built-in X */}
          <div className="pointer-events-none absolute top-3 right-3 opacity-0">
            <X className="size-4" aria-hidden />
          </div>

          <div className="mt-1 rounded-xl overflow-hidden bg-white/[0.03] border border-white/[0.05]">
            <img
              src={product.image}
              alt={product.name}
              loading="lazy"
              className="w-full aspect-square object-cover"
            />
          </div>

          <h3 className="mt-4 text-[15.5px] font-semibold tracking-tight text-foreground leading-snug">
            {product.name}
          </h3>

          {product.rating > 0 && (
            <div className="mt-1.5 flex items-center gap-1.5 text-[12px] text-white/60">
              <Star className="size-3.5 fill-amber-400 text-amber-400" aria-hidden />
              <span className="tabular-nums">{product.rating.toFixed(1)}</span>
              <span className="text-white/40">·</span>
              <span className="tabular-nums">{product.reviews} reviews</span>
            </div>
          )}

          <div className="mt-3 flex items-baseline gap-2.5">
            <span className="text-[18px] font-semibold text-foreground tabular-nums">
              {format(price)}
            </span>
            {originalRaw && (
              <span className="text-[12.5px] text-white/40 line-through tabular-nums">
                {format(originalRaw)}
              </span>
            )}
          </div>

          {pill && (
            <div className="mt-2.5">
              <span
                className={`inline-flex items-center rounded-full border px-2 py-[2px] text-[10.5px] font-medium tracking-wide ${pillClasses[pill.tone]}`}
              >
                {pill.label}
              </span>
            </div>
          )}

          <p className="mt-3 text-[12.5px] text-white/60">
            {product.inStock !== false && product.stockQuantity > 0
              ? "In stock"
              : "Currently unavailable"}
          </p>

          {specEntries.length > 0 && (
            <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-white/[0.05] pt-4">
              {specEntries.map(([k, v]) => (
                <div key={k} className="min-w-0 text-[12px]">
                  <dt className="text-white/45 truncate">{k}</dt>
                  <dd className="text-white/85 truncate">{v}</dd>
                </div>
              ))}
            </dl>
          )}

          <div className="mt-6 flex items-center gap-2">
            <button
              type="button"
              disabled={isPinned}
              onClick={() => onToggle(product.slug)}
              aria-pressed={isSelected}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-[12px] text-white/80 hover:text-foreground hover:border-white/25 disabled:opacity-50 disabled:cursor-not-allowed min-h-[36px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            >
              <span
                aria-hidden
                className={`grid place-items-center size-3.5 rounded-[3.5px] border transition-colors duration-150 ${
                  isSelected
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-white/25"
                }`}
              >
                {isSelected && <Check className="size-2.5" strokeWidth={3} />}
              </span>
              {isPinned ? "Current" : isSelected ? "Added" : "Compare"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center rounded-full border border-white/10 px-3 py-1.5 text-[12px] text-white/60 hover:text-white/85 hover:border-white/20 min-h-[36px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            >
              Close
            </button>
            <Link
              to="/products/$slug"
              params={{ slug: product.slug }}
              onClick={onClose}
              className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-accent text-accent-foreground px-3.5 py-1.5 text-[12px] font-medium min-h-[36px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            >
              View product
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
