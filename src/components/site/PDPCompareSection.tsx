import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Check, Loader2, Star, Zap } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";

import { useProducts } from "@/lib/use-products";
import { resolveImage, type Product } from "@/lib/products";
import { useRegion } from "@/lib/region";
import { useCompare } from "@/hooks/use-compare";
import { useCartActions } from "@/lib/cart";
import { useBuyNow } from "@/lib/use-buy-now";
import { Sheet, SheetContent } from "@/components/ui/sheet";

/**
 * PDP — Similar Products (v9.1 · Final Micro-Polish)
 *
 * Freeze candidate. Feature-complete. This release focuses exclusively on
 * micro-interaction quality and visual consistency: image skeleton + fade-in,
 * tactile press feedback, fixed-width Compare pill, reserved price rhythm,
 * standardized typography, edge-padded carousel, and a brief "flash → fade
 * sticky bar → navigate" transition into the Compare page.
 * No new features, no business logic, no backend changes.
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

function recommendationFor(
  p: Product,
  ctx: {
    curPrice: number;
    curRating: number;
    curReviews: number;
    curShipping: number;
    curFast: boolean;
    price: number;
    shipping: number;
  },
): string | null {
  const { curPrice, curRating, curReviews, curShipping, curFast, price, shipping } = ctx;
  if (curPrice > 0 && price > 0 && price < curPrice && (curPrice - price) / curPrice >= 0.05) {
    return "Lower price";
  }
  if ((p.rating || 0) >= (curRating || 0) + 0.3 && (p.rating || 0) > 0) {
    return "Higher rating";
  }
  if (shipping === 0 && curShipping > 0) return "Free delivery";
  if (p.fastSelling && !curFast) return "Fast delivery";
  if ((p.reviews || 0) >= 20 && (p.reviews || 0) >= (curReviews || 0) * 1.5) {
    return "Most popular";
  }
  if (p.bestseller) return "Best seller";
  if (p.newArrival) return "Newest arrival";
  return null;
}


// ============================ Component ============================

export function PDPCompareSection({ currentProduct }: { currentProduct: Product }) {
  const { products } = useProducts();
  const { priceOf, shippingFeeOf } = useRegion();
  const { slugs, toggle, has, isFull, max } = useCompare();
  const navigate = useNavigate();
  const [navigating, setNavigating] = useState(false);
  const [flashing, setFlashing] = useState(false);
  const [sort, setSort] = useState<SortKey>(() => readSort());
  const [preview, setPreview] = useState<Product | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);
  const [sectionVisible, setSectionVisible] = useState(false);

  const currentSlug = currentProduct.slug;
  const currentPrice = priceOf(currentProduct) || 0;

  const suggestions = useMemo(() => {
    if (!products.length) return [] as Product[];
    const cur = currentProduct;
    const curCats = new Set([cur.category, ...(cur.categories ?? [])].filter(Boolean));
    const curFeatures = new Set(
      ((cur as any).features ?? [])
        .concat((cur as any).tags ?? [])
        .filter(Boolean)
        .map((f: unknown) => String(f).toLowerCase()),
    );

    // Availability tier: In Stock (0) > Limited (1) > Pre-order (2) > OOS (3)
    const availTier = (p: Product): number => {
      if (p.status === "out_of_stock" || p.inStock === false) return 3;
      if ((p as any).preorder || p.status === "preorder") return 2;
      if ((p as any).limitedStock || (typeof (p as any).stock === "number" && (p as any).stock > 0 && (p as any).stock <= 5)) return 1;
      return 0;
    };

    // Normalize a product name to a "root" so colour/storage variants collapse.
    // Strips common variant tokens (colours, storage, RAM, sizes, trailing parens).
    const variantRoot = (p: Product): string => {
      const raw = (p.name || "").toLowerCase();
      const stripped = raw
        .replace(/\([^)]*\)/g, " ")
        .replace(/\b(black|white|silver|gold|rose|blue|green|red|graphite|grey|gray|titanium|purple|pink|yellow|beige|navy|cream|mint)\b/g, " ")
        .replace(/\b\d+\s?(gb|tb|mb)\b/g, " ")
        .replace(/\b\d+\s?(gb|tb)\s?ram\b/g, " ")
        .replace(/\b(xs|s|m|l|xl|xxl|xxxl)\b/g, " ")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
      return `${p.brand ?? ""}|${stripped}`;
    };
    const currentRoot = variantRoot(cur);

    // Relevance-first ranking (spec priority):
    //   1 Same Brand  2 Same Product Type  3 Same Category
    //   4 Similar Price (tiered ±15% / ±30% / ±50%)  5 Shared Features
    //   6 Availability  7 Rating (secondary tiebreak only)
    const scored = products
      .filter((p) => p.slug !== cur.slug && p.status !== "archived" && !p.hideFromRecommendations)
      .map((p) => {
        let score = 0;
        const brandMatch = !!(cur.brand && p.brand && p.brand === cur.brand);
        const typeMatch = !!(cur.productType && p.productType && p.productType === cur.productType);
        if (brandMatch) score += 40;
        if (typeMatch) score += 30;
        const pCats = [p.category, ...(p.categories ?? [])].filter(Boolean);
        const catOverlap = pCats.some((c) => curCats.has(c));
        if (catOverlap) score += 20;

        const price = priceOf(p) || 0;
        let priceBand: "close" | "near" | "wide" | "far" = "far";
        if (currentPrice > 0 && price > 0) {
          const diff = Math.abs(price - currentPrice) / currentPrice;
          if (diff <= 0.15) { score += 12; priceBand = "close"; }
          else if (diff <= 0.3) { score += 7; priceBand = "near"; }
          else if (diff <= 0.5) { score += 2; priceBand = "wide"; }
        }

        if (curFeatures.size) {
          const pFeat = ((p as any).features ?? [])
            .concat((p as any).tags ?? [])
            .map((f: unknown) => String(f).toLowerCase());
          const overlap = pFeat.filter((f: string) => curFeatures.has(f)).length;
          if (overlap) score += Math.min(overlap, 4) * 2;
        }

        // Availability weighted: prefer buyable; OOS pushed to the back
        const tier = availTier(p);
        score += [6, 2, 0, -20][tier];

        // Rating: tiny secondary nudge only — never overpowers relevance
        score += Math.min(p.rating || 0, 5) * 0.4;

        const relevant = catOverlap || brandMatch || typeMatch;
        return { p, score, relevant, tier, price, priceBand, root: variantRoot(p) };
      })
      .filter((x) => x.relevant) // Quality gate: never fill with unrelated products
      .sort((a, b) => (a.tier - b.tier) || (b.score - a.score));

    if (scored.length === 0) return [] as Product[];

    // Diversity: collapse variant duplicates (same brand + same normalized root).
    // Keep the strongest instance of each root, but never the current product's root.
    const byRoot = new Map<string, typeof scored[number]>();
    for (const item of scored) {
      if (item.root === currentRoot) continue;
      const existing = byRoot.get(item.root);
      if (!existing || item.score > existing.score) byRoot.set(item.root, item);
    }
    const deduped = Array.from(byRoot.values()).sort((a, b) => (a.tier - b.tier) || (b.score - a.score));

    // Price coverage: interleave across bands so the rail spans real budget options
    // instead of clustering at one price. Preserves per-band relevance order.
    const bands: Record<"close" | "near" | "wide" | "far", typeof deduped> = {
      close: [], near: [], wide: [], far: [],
    };
    for (const it of deduped) bands[it.priceBand].push(it);
    const bandOrder: Array<"close" | "near" | "wide" | "far"> = ["close", "near", "wide", "far"];
    const interleaved: typeof deduped = [];
    // Round-robin across bands until VISIBLE_LIMIT reached
    let added = true;
    while (added && interleaved.length < VISIBLE_LIMIT) {
      added = false;
      for (const b of bandOrder) {
        const next = bands[b].shift();
        if (next) { interleaved.push(next); added = true; }
        if (interleaved.length >= VISIBLE_LIMIT) break;
      }
    }
    // Re-stabilize by availability tier so in-stock always leads, without losing spread
    interleaved.sort((a, b) => a.tier - b.tier);

    return interleaved.map((x) => x.p);
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

  const currentShipping = shippingFeeOf(currentProduct);
  const currentFast = !!currentProduct.fastSelling;

  const handleToggle = useCallback(
    (slug: string, name?: string) => {
      if (slug === currentSlug) return;
      if (!has(slug) && isFull) {
        toast.message(`Maximum ${max} products`);
        return;
      }
      const wasSelected = has(slug);
      toggle(slug);
      if (!wasSelected) {
        toast.success("Added to comparison", {
          description: name,
          duration: 1500,
          position: "bottom-center",
        });
      }
    },
    [currentSlug, has, isFull, max, toggle],
  );

  const handleCompare = () => {
    if (!canCompare || navigating) return;
    setNavigating(true);
    // v9.1 — brief highlight of selected cards + fade sticky bar, then navigate.
    setFlashing(true);
    window.setTimeout(() => {
      navigate({ to: "/compare" });
    }, 140);
  };

  const handleSort = (v: SortKey) => { setSort(v); writeSort(v); };

  if (products.length === 0) return null;

  if (suggestions.length < 2) {
    return (
      <section
        className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mt-20 sm:mt-24"
        aria-labelledby="pdp-ymal-heading"
      >
        <h2 id="pdp-ymal-heading" className="text-[20px] sm:text-[22px] font-semibold tracking-tight text-foreground leading-tight">
          Similar Products
        </h2>
        <p className="mt-3 text-[13px] text-white/55 leading-relaxed">
          No similar products are available at the moment. Explore more products in this category.
        </p>
        {currentProduct.category && (
          <Link
            to="/category/$slug"
            params={{ slug: currentProduct.category }}
            className="mt-4 inline-flex items-center gap-1.5 h-11 text-[13.5px] font-medium text-foreground/80 hover:text-accent transition-colors duration-150"
          >
            Browse Category
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        )}
      </section>
    );
  }

  return (
    <section
      ref={sectionRef as React.RefObject<HTMLElement>}
      className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mt-20 sm:mt-24"
      data-pdp-compare
      aria-labelledby="pdp-ymal-heading"
    >
      <SectionVisibility onChange={setSectionVisible} target={sectionRef} />

      <div className="mb-6 sm:mb-8">
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

      {/* Carousel — first card aligned to page padding, last card gets breathing room */}
      <div className="relative -mx-4 sm:mx-0">
        <ul
          className="flex overflow-x-auto snap-x gap-3.5 sm:gap-4 pl-4 pr-3 sm:pl-1 sm:pr-2 pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          style={{
            overscrollBehaviorX: "contain",
            WebkitOverflowScrolling: "touch",
            scrollPaddingLeft: "1rem",
            scrollSnapType: "x mandatory",
          }}
        >
          <li className="shrink-0 snap-start w-[62%] min-[420px]:w-[52%] sm:w-[240px]">
            <RailItem
              product={currentProduct}
              pinned
              onPreview={() => setPreview(currentProduct)}
            />
          </li>
          {sortedSuggestions.map((p) => {
            const active = has(p.slug);
            const disabled = !active && isFull;
            const price = priceOf(p) || 0;
            const shipping = shippingFeeOf(p);
            const recommendation = recommendationFor(p, {
              curPrice: currentPrice,
              curRating: currentProduct.rating || 0,
              curReviews: currentProduct.reviews || 0,
              curShipping: currentShipping,
              curFast: currentFast,
              price,
              shipping,
            });
            return (
              <li key={p.slug} className="shrink-0 snap-start w-[62%] min-[420px]:w-[52%] sm:w-[240px]">
                <RailItem
                  product={p}
                  active={active}
                  disabled={disabled}
                  flashing={active && flashing}
                  recommendation={recommendation}
                  freeDelivery={shipping === 0}
                  onToggle={() => handleToggle(p.slug, p.name)}
                  onPreview={() => setPreview(p)}
                />
              </li>
            );
          })}
          {/* trailing spacer so the last card isn't flush against the screen edge */}
          <div aria-hidden className="shrink-0 w-3 sm:w-2" />
        </ul>
      </div>

      {sortedSuggestions.length >= VIEW_MORE_THRESHOLD && (
        <div className="mt-7 flex justify-center sm:justify-start px-1">
          <Link
            to="/category/$slug"
            params={{ slug: currentProduct.category || "all" }}
            className="group inline-flex items-center gap-1.5 h-11 px-2 -mx-2 text-[13.5px] font-medium text-foreground/80 hover:text-accent transition-colors duration-150"
          >
            View all similar products
            <ArrowRight
              className="size-3.5 transition-transform duration-150 ease-out group-hover:translate-x-0.5 group-active:translate-x-1"
              aria-hidden
            />
          </Link>
        </div>
      )}

      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {selectedNonCurrent === 0
          ? "No alternatives selected for comparison."
          : `${selectedCount} products selected for comparison.`}
      </div>

      {/* Inline compare summary — single clean row */}
      <div className="mt-7 flex items-center justify-between gap-3 border-t border-white/[0.05] pt-5">
        <span className={`text-[13px] font-medium tabular-nums ${canCompare ? "text-foreground/90" : "text-white/50"}`}>
          {selectedNonCurrent === 0 ? "Select at least 1 more" : `${selectedCount} Selected`}
        </span>
        <button
          type="button"
          disabled={!canCompare || navigating}
          onClick={handleCompare}
          aria-label={canCompare ? "Compare selected products" : "Select one more product to compare"}
          className={`inline-flex items-center justify-center gap-1.5 rounded-full h-11 px-5 text-[13px] font-semibold tracking-wide transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
            canCompare && !navigating
              ? "bg-accent text-accent-foreground hover:brightness-110"
              : "bg-white/[0.04] text-white/35 cursor-not-allowed"
          }`}
        >
          {navigating ? (
            <><Loader2 className="size-3.5 animate-spin" aria-hidden /> Opening</>
          ) : (
            <>Compare Products <ArrowRight className="size-3.5" aria-hidden /></>
          )}
        </button>
      </div>

      {/* Sticky compare panel — fades out during navigation for a seamless handoff */}
      <StickyCompareBar
        visible={sectionVisible && canCompare && !flashing}
        count={selectedCount}
        navigating={navigating}
        onCompare={handleCompare}
      />

      <QuickPreviewSheet
        product={preview}
        onClose={() => setPreview(null)}
        onToggle={(slug) => handleToggle(slug, preview?.name)}
        isSelected={preview ? preview.slug === currentSlug || has(preview.slug) : false}
        isPinned={preview ? preview.slug === currentSlug : false}
      />
    </section>
  );
}

// ============================ Section visibility observer ============================

function SectionVisibility({
  target,
  onChange,
}: {
  target: React.RefObject<HTMLElement | null>;
  onChange: (visible: boolean) => void;
}) {
  useEffect(() => {
    const el = target.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => onChange(entry.isIntersecting && entry.intersectionRatio > 0.05),
      { threshold: [0, 0.05, 0.25] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [target, onChange]);
  return null;
}

// ============================ Sticky compare bar ============================

function StickyCompareBar({
  visible,
  count,
  navigating,
  onCompare,
}: {
  visible: boolean;
  count: number;
  navigating: boolean;
  onCompare: () => void;
}) {
  return (
    <div
      aria-hidden={!visible}
      className={`fixed inset-x-0 bottom-3 z-40 px-3 pointer-events-none transition-opacity duration-150 ease-out ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      <div
        className={`pointer-events-auto mx-auto max-w-[420px] flex items-center justify-between gap-3 rounded-full bg-black/75 backdrop-blur-xl pl-5 pr-2 h-12 shadow-[0_8px_28px_-14px_rgba(0,0,0,0.6)] transition-transform duration-150 ease-out ${
          visible ? "translate-y-0" : "translate-y-3"
        }`}
      >
        <span className="text-[13px] font-medium text-foreground/90 tabular-nums">
          {count} Selected
        </span>
        <button
          type="button"
          disabled={navigating}
          onClick={onCompare}
          className="inline-flex items-center gap-1.5 rounded-full bg-accent text-accent-foreground h-9 px-4 text-[12.5px] font-semibold tracking-wide transition-[filter] duration-150 ease-out hover:brightness-110 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          {navigating ? (
            <><Loader2 className="size-3.5 animate-spin" aria-hidden /> Opening</>
          ) : (
            <>Compare Products <ArrowRight className="size-3.5" aria-hidden /></>
          )}
        </button>
      </div>
    </div>
  );
}

// ============================ Card ============================

type RailItemProps = {
  product: Product;
  active?: boolean;
  disabled?: boolean;
  pinned?: boolean;
  flashing?: boolean;
  recommendation?: string | null;
  freeDelivery?: boolean;
  onToggle?: () => void;
  onPreview?: () => void;
};

function RailItemImpl({
  product,
  active,
  disabled,
  pinned,
  flashing,
  recommendation,
  freeDelivery,
  onToggle,
  onPreview,
}: RailItemProps) {
  const { priceOf, format } = useRegion();
  const [imgLoaded, setImgLoaded] = useState(false);
  const [pressed, setPressed] = useState(false);

  const price = priceOf(product) || 0;
  const originalRaw =
    (product.comparePriceInr && product.comparePriceInr > price ? product.comparePriceInr : null) ??
    (product.comparePriceUsd && product.comparePriceUsd > price ? product.comparePriceUsd : null);
  const savings = originalRaw && originalRaw > price ? originalRaw - price : 0;

  // v9.1 — tactile card press. No zoom, no bounce, no glow. Subtle bg + border only.
  const pressHandlers = {
    onPointerDown: () => setPressed(true),
    onPointerUp: () => setPressed(false),
    onPointerCancel: () => setPressed(false),
    onPointerLeave: () => setPressed(false),
  };

  return (
    <div
      {...pressHandlers}
      className={`flex h-full flex-col rounded-2xl border transition-[background-color,border-color] duration-150 ease-out ${
        flashing
          ? "bg-accent/[0.06] border-accent/40"
          : pressed
            ? "bg-white/[0.05] border-white/[0.14]"
            : "bg-white/[0.02] border-white/[0.05]"
      }`}
    >
      {/* Image — ~58% of card. Tap = Quick Preview. Skeleton until loaded. */}
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onPreview?.(); }}
        aria-label={`Quick preview: ${product.name}`}
        className="block w-full p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-inset rounded-t-2xl"
      >
        <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-white/[0.04]">
          {/* Skeleton — soft pulse, exact final size */}
          <div
            aria-hidden
            className={`absolute inset-0 bg-white/[0.04] transition-opacity duration-150 ease-out ${
              imgLoaded ? "opacity-0" : "opacity-100 animate-pulse"
            }`}
          />
          {product.image && (
            <img
              src={resolveImage(product.image)}
              alt={product.name}
              loading="lazy"
              decoding="async"
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgLoaded(true)}
              className={`h-full w-full object-cover transition-opacity duration-150 ease-out ${
                imgLoaded ? "opacity-100" : "opacity-0"
              }`}
            />
          )}
        </div>
      </button>

      {/* Content — standardized typography rhythm across every card */}
      <div className="flex flex-1 flex-col px-4 pb-4">
        <Link
          to="/products/$slug"
          params={{ slug: product.slug }}
          className="line-clamp-2 min-h-[42px] text-[15px] font-semibold leading-[1.4] tracking-[-0.005em] text-foreground/90 hover:text-accent transition-colors duration-150"
        >
          {product.name}
        </Link>

        {/* Rating — 13px, reserved height */}
        <div className="mt-2.5 flex h-[16px] items-center gap-1 text-[13px]">
          {product.rating > 0 ? (
            <>
              <Star className="size-3.5 fill-amber-400 text-amber-400" aria-hidden />
              <span className="tabular-nums text-white/80">{product.rating.toFixed(1)}</span>
            </>
          ) : (
            <span className="text-white/35 text-[12px]">New</span>
          )}
        </div>

        {/* Price block — reserves current + original + save row, always. */}
        <div className="mt-3">
          {/* Row 1 — current + original */}
          <div className="flex h-[22px] items-baseline gap-2 flex-wrap">
            <span className="text-[18px] font-bold text-foreground tabular-nums leading-none tracking-[-0.01em]">
              {format(price)}
            </span>
            <span className="text-[12px] text-white/40 line-through tabular-nums leading-none min-w-[1ch]">
              {originalRaw ? format(originalRaw) : "\u00A0"}
            </span>
          </div>
          {/* Row 2 — savings slot, always reserved */}
          <div className="mt-1.5 h-[14px] text-[12px] font-medium text-emerald-300/85 tabular-nums leading-none">
            {savings > 0 ? `Save ${format(savings)}` : "\u00A0"}
          </div>
        </div>

        {/* Free delivery — quiet 12px */}
        <div className="mt-2.5 h-[14px] text-[12px] font-medium tabular-nums leading-none">
          {freeDelivery && !pinned ? (
            <span className="text-emerald-300/80">Free delivery</span>
          ) : null}
        </div>

        {/* Recommendation — 11px, single short line */}
        <div className="mt-1.5 h-[13px] text-[11px] font-medium tracking-wide text-white/55 leading-none">
          {!pinned && recommendation ? recommendation : null}
        </div>

        {/* Selector — full-width pill, fixed height, morphing icon+text only */}
        <div className="mt-4">
          {pinned ? (
            <div className="flex h-[46px] items-center justify-center rounded-full bg-white/[0.04] text-[12.5px] font-medium text-white/55 tracking-wide">
              Current Product
            </div>
          ) : (
            <button
              type="button"
              onClick={onToggle}
              aria-pressed={!!active}
              aria-label={
                active
                  ? `Remove ${product.name} from comparison`
                  : `Select ${product.name} for comparison`
              }
              disabled={disabled}
              className={`relative flex h-[46px] w-full items-center justify-center rounded-full transition-colors duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
                active
                  ? "bg-accent/[0.14] text-accent"
                  : "bg-white/[0.05] text-foreground/85 hover:bg-white/[0.08]"
              }`}
            >
              {/* Absolutely-positioned label rows prevent any layout shift on morph */}
              <span
                aria-hidden={active}
                className={`absolute inset-0 flex items-center justify-center text-[13px] font-semibold tracking-wide leading-none transition-opacity duration-150 ease-out ${
                  active ? "opacity-0" : "opacity-100"
                }`}
              >
                Compare
              </span>
              <span
                aria-hidden={!active}
                className={`absolute inset-0 flex items-center justify-center gap-1.5 text-[13px] font-semibold tracking-wide leading-none transition-opacity duration-150 ease-out ${
                  active ? "opacity-100" : "opacity-0"
                }`}
              >
                <Check className="size-3.5" strokeWidth={3} aria-hidden />
                Added
              </span>
            </button>
          )}
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
  onToggle,
  isSelected,
  isPinned,
}: {
  product: Product | null;
  onClose: () => void;
  onToggle: (slug: string) => void;
  isSelected: boolean;
  isPinned: boolean;
}) {
  const { priceOf, format, shippingFeeOf } = useRegion();
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
  const savings = originalRaw && originalRaw > price ? originalRaw - price : 0;
  const shipping = shippingFeeOf(product);

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
              <span className="text-[12.5px] text-white/40 line-through tabular-nums">
                {format(originalRaw)}
              </span>
            )}
            {savings > 0 && (
              <span className="text-[11.5px] font-medium text-emerald-300/85 tabular-nums">
                Save {format(savings)}
              </span>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11.5px] tabular-nums">
            {shipping === 0 && (
              <span className="text-emerald-300/85 font-medium">Free delivery</span>
            )}
            <span className={
              !inStock ? "text-red-300/80" : lowStock ? "text-amber-300/85" : "text-emerald-300/85"
            }>
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

          {!isPinned && (
            <button
              type="button"
              onClick={() => onToggle(product.slug)}
              aria-pressed={isSelected}
              className={`relative mt-5 flex h-[44px] w-full items-center justify-center rounded-full text-[13px] font-semibold tracking-wide transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
                isSelected
                  ? "bg-accent/[0.14] text-accent"
                  : "bg-white/[0.05] text-foreground/85 hover:bg-white/[0.08]"
              }`}
            >
              <span
                aria-hidden={isSelected}
                className={`absolute inset-0 flex items-center justify-center transition-opacity duration-150 ease-out ${
                  isSelected ? "opacity-0" : "opacity-100"
                }`}
              >
                Compare
              </span>
              <span
                aria-hidden={!isSelected}
                className={`absolute inset-0 flex items-center justify-center gap-1.5 transition-opacity duration-150 ease-out ${
                  isSelected ? "opacity-100" : "opacity-0"
                }`}
              >
                <Check className="size-3.5" strokeWidth={3} aria-hidden />
                Added
              </span>
            </button>
          )}

          <div className="mt-3 grid grid-cols-2 gap-2.5">
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
