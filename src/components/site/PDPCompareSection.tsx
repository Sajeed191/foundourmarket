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


// ============================ Component ============================

export function PDPCompareSection({ currentProduct }: { currentProduct: Product }) {
  const { products } = useProducts();
  const { priceOf, shippingFeeOf, format } = useRegion();
  const { slugs, toggle, has, isFull, max } = useCompare();
  const navigate = useNavigate();
  const [navigating, setNavigating] = useState(false);
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
        className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mt-20 sm:mt-24"
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
                    transition={{ duration: 0.15, ease: "easeOut" }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Carousel — ~2.2 cards on mobile */}
      <div className="relative -mx-4 sm:mx-0">
        <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-4 bg-gradient-to-r from-background/95 to-transparent z-10" />
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-4 bg-gradient-to-l from-background/95 to-transparent z-10" />

        <ul
          className="flex overflow-x-auto gap-4 sm:gap-5 px-4 sm:px-1 pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          style={{ overscrollBehaviorX: "contain", WebkitOverflowScrolling: "touch" }}
        >
          <li className="shrink-0 w-[44%] min-[420px]:w-[40%] sm:w-[220px]">
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
            return (
              <li key={p.slug} className="shrink-0 w-[44%] min-[420px]:w-[40%] sm:w-[220px]">
                <RailItem
                  product={p}
                  active={active}
                  disabled={disabled}
                  pill={pillFor(p, shippingFeeOf(p))}
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

      {/* Inline compare summary — resting state */}
      <div className="mt-6 flex items-center justify-between gap-3 border-t border-white/[0.05] pt-5">
        <div className="min-w-0">
          <div className={`text-[13px] font-medium tabular-nums leading-tight ${canCompare ? "text-foreground/90" : "text-white/50"}`}>
            {selectedNonCurrent === 0
              ? "Select at least 1 more"
              : `${selectedCount} products selected`}
          </div>
          <div className="mt-1 text-[11.5px] text-white/45 leading-tight">
            {canCompare ? "Compare features side by side" : "Tap Compare on any card"}
          </div>
        </div>
        <button
          type="button"
          disabled={!canCompare || navigating}
          onClick={handleCompare}
          aria-label={canCompare ? "Compare selected products" : "Select one more product to compare"}
          className={`inline-flex items-center justify-center gap-1.5 rounded-full border h-11 px-5 text-[13px] font-semibold tracking-wide transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
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

      {/* Sticky compare panel — shows only when the section is on-screen AND at least one alt is selected */}
      <StickyCompareBar
        visible={sectionVisible && canCompare}
        count={selectedCount}
        navigating={navigating}
        onCompare={handleCompare}
      />

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
        className={`pointer-events-auto mx-auto max-w-[420px] flex items-center justify-between gap-3 rounded-full border border-white/[0.08] bg-black/70 backdrop-blur-xl px-4 py-2 shadow-[0_8px_28px_-14px_rgba(0,0,0,0.6)] transition-transform duration-150 ease-out ${
          visible ? "translate-y-0" : "translate-y-3"
        }`}
      >
        <span className="text-[12.5px] font-medium text-foreground/85 tabular-nums">
          {count} selected
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
  pill?: Pill | null;
  onToggle?: () => void;
  onPreview?: () => void;
};

function RailItemImpl({
  product,
  active,
  disabled,
  pinned,
  pill,
  onToggle,
  onPreview,
}: RailItemProps) {
  const { priceOf, format } = useRegion();
  const { toggle: toggleWishlist } = useWishlistActions();
  const saved = useWishlistSaved(product.slug);
  

  const price = priceOf(product) || 0;
  const originalRaw =
    (product.comparePriceInr && product.comparePriceInr > price ? product.comparePriceInr : null) ??
    (product.comparePriceUsd && product.comparePriceUsd > price ? product.comparePriceUsd : null);
  const discountPct = originalRaw && originalRaw > price
    ? Math.round(((originalRaw - price) / originalRaw) * 100) : 0;

  const statusPill: { label: string; tone: "current" | "selected" } | null =
    pinned ? { label: "Current Product", tone: "current" }
    : active ? { label: "Selected", tone: "selected" }
    : null;

  return (
    <div className="flex h-full flex-col">
      {/* Unified status pill slot — same visual system for every state */}
      <div className="mb-2.5 h-[22px] px-0.5 flex items-center">
        {statusPill && (
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-[3px] text-[10px] font-medium tracking-wide transition-colors duration-150 ease-out ${
              statusPill.tone === "selected"
                ? "border-accent/35 bg-accent/[0.08] text-accent"
                : "border-white/[0.08] bg-white/[0.05] text-white/60"
            }`}
          >
            {statusPill.tone === "selected" && (
              <Check className="size-2.5" strokeWidth={3} aria-hidden />
            )}
            {statusPill.label}
          </span>
        )}
      </div>

      <div
        className={`relative flex flex-1 flex-col rounded-2xl border transition-[border-color,background-color] duration-150 ease-out ${
          active && !pinned
            ? "border-accent/25 bg-accent/[0.012]"
            : "border-white/[0.06] bg-white/[0.015]"
        }`}
      >
        {/* Image = primary interaction → open Quick Preview. Padded so product breathes. */}
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onPreview?.(); }}
          aria-label={`Quick preview: ${product.name}`}
          className="relative block w-full p-2.5 pb-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-inset rounded-t-2xl"
        >
          <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-white/[0.03]">
            {product.image && (
              <img
                src={resolveImage(product.image)}
                alt={product.name}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover transition-opacity duration-150"
              />
            )}
            {discountPct >= 5 && !pinned && (
              <span className="absolute left-2 top-2 rounded-full bg-black/60 backdrop-blur px-1.5 py-[2px] text-[10px] font-semibold text-white/90 tabular-nums">
                −{discountPct}%
              </span>
            )}
          </div>
        </button>

        {/* Wishlist — top right of card */}
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleWishlist(product.slug); }}
          aria-label={saved ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
          aria-pressed={saved}
          className={`absolute right-3.5 top-3.5 grid size-8 place-items-center rounded-full border backdrop-blur transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
            saved
              ? "border-accent/50 bg-black/50 text-accent"
              : "border-white/15 bg-black/40 text-white/75 hover:text-foreground hover:border-white/30"
          }`}
        >
          <Heart className={`size-3.5 ${saved ? "fill-accent" : ""}`} aria-hidden />
        </button>

        {/* Content */}
        <div className="flex flex-1 flex-col px-3.5 pt-3 pb-3">

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

          {/* Price + savings */}
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

          {/* Single factual highlight (delivery / stock / status) */}
          <div className="mt-2 mb-3 flex h-[20px] items-center">
            {pill && (
              <span className={`inline-flex items-center rounded-full border px-1.5 py-[1px] text-[10px] font-medium tracking-wide ${pillClasses[pill.tone]}`}>
                {pill.label}
              </span>
            )}
          </div>
        </div>

        {/* Compare selector — hairline separator only */}
        <div className="mt-auto border-t border-white/[0.03]">
          {pinned ? (
            <div className="flex h-[44px] items-center justify-center px-3.5">
              <span className="text-[12.5px] font-medium text-white/35 tracking-wide">
                Current
              </span>
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
              className="flex h-[44px] w-full items-center justify-center gap-1.5 px-3.5 rounded-b-2xl transition-colors duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-inset hover:bg-white/[0.02]"
            >
              <span
                aria-hidden
                className={`transition-opacity duration-150 ease-out ${
                  active ? "opacity-100 text-accent" : "opacity-0 w-0"
                }`}
              >
                <Check className="size-3.5" strokeWidth={2.75} />
              </span>
              <span
                className={`text-[13.5px] font-medium leading-none whitespace-nowrap transition-colors duration-150 ease-out ${
                  active ? "text-accent" : "text-white/65"
                }`}
              >
                {active ? "Selected" : "Compare"}
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
