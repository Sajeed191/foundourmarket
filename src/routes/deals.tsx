import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Zap, Flame, Search, X, ArrowDownWideNarrow, Star, ArrowRight } from "lucide-react";
import { useFlashDeals } from "@/lib/use-flash-deals";
import { BrowseCard } from "@/components/site/BrowseCard";
import type { Product } from "@/lib/products";
import { buildBrowsePresentation, sortProductsForBrowse } from "@/lib/browse";
import { hasAssignedCollectionBadge, useBadgeCatalog } from "@/lib/use-product-badges";

export const Route = createFileRoute("/deals")({
  head: () => ({
    meta: [
      { title: "Flash Deals — FoundOurMarket™" },
      {
        name: "description",
        content:
          "Live flash sales and hot deals across FoundOurMarket™. Refreshed daily with discounts up to 70% off — while stock lasts.",
      },
      { property: "og:title", content: "Flash Deals — FoundOurMarket™" },
      {
        property: "og:description",
        content: "Live flash sales and hot deals. Refreshed daily — while stock lasts.",
      },
    ],
  }),
  component: DealsPage,
});

type DealSort = "recommended" | "savings" | "ending" | "newest" | "rating" | "price-low" | "popular";

const SORT_OPTIONS: { value: DealSort; label: string }[] = [
  { value: "recommended", label: "Recommended" },
  { value: "savings", label: "Highest discount" },
  { value: "ending", label: "Ending soon" },
  { value: "price-low", label: "Lowest price" },
  { value: "newest", label: "Newest" },
  { value: "rating", label: "Best rated" },
  { value: "popular", label: "Most popular" },
];

/** Customer-facing quick filters. Presentation only — no backend ranking change. */
type QuickKey =
  | "all"
  | "hot"
  | "ending"
  | "todays"
  | "editors"
  | "discount"
  | "rated"
  | "new";

const QUICK_FILTERS: { key: QuickKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "hot", label: "Hot Deals" },
  { key: "ending", label: "Ending Soon" },
  { key: "todays", label: "Today's Picks" },
  { key: "editors", label: "Editor's Choice" },
  { key: "discount", label: "Highest Discount" },
  { key: "rated", label: "Best Rated" },
  { key: "new", label: "New Arrival" },
];

/** Quick filters that simply reorder the same live set. */
const QUICK_SORT: Partial<Record<QuickKey, DealSort>> = {
  discount: "savings",
  rated: "rating",
  ending: "ending",
};

const BATCH_SIZE = 20;

function DealsPage() {
  // Explore page shows every eligible live Flash Deal (up to the hard safety
  // cap) while the homepage stays capped by Site Rules. Only LIVE deals reach
  // `items` — expired / paused / scheduled / unpublished and out-of-stock
  // products are already excluded upstream.
  const { items, loading } = useFlashDeals({ limit: "all" });
  const { map: badgeMap } = useBadgeCatalog();

  const [quick, setQuick] = useState<QuickKey>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<DealSort>("recommended");
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);

  const dealProducts = useMemo(() => items.map((i) => i.product), [items]);
  const endAtByProductId = useMemo(() => {
    const m = new Map<string, string>();
    for (const i of items) if (i.endAt && i.product.id) m.set(i.product.id, i.endAt);
    return m;
  }, [items]);

  const hasBadge = useCallback(
    (p: Product, keys: string[]) => hasAssignedCollectionBadge(badgeMap.get(p.slug), keys),
    [badgeMap],
  );

  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return dealProducts.filter((p) => {
      if (q && !`${p.name} ${p.category ?? ""}`.toLowerCase().includes(q)) return false;
      switch (quick) {
        case "hot":
          return hasBadge(p, ["hot_deal"]);
        case "todays":
          return hasBadge(p, ["todays_pick", "today_s_pick", "featured"]);
        case "editors":
          return hasBadge(p, ["editors_choice", "editor_s_choice", "editors_pick"]);
        case "new":
          return hasBadge(p, ["new"]);
        case "ending":
          return !!(p.id && endAtByProductId.get(p.id));
        default:
          return true;
      }
    });
  }, [dealProducts, query, quick, hasBadge, endAtByProductId]);

  const presentation = useMemo(
    () => buildBrowsePresentation({ products: filteredProducts, surface: "deals" }),
    [filteredProducts],
  );

  const effectiveSort = QUICK_SORT[quick] ?? sort;

  const sortedProducts = useMemo(() => {
    const base = sortProductsForBrowse(filteredProducts, presentation, "recommended");
    const arr = [...base];
    switch (effectiveSort) {
      case "savings":
        return arr.sort((a, b) => (b.discount ?? 0) - (a.discount ?? 0));
      case "price-low":
        return arr.sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
      case "newest":
        return arr.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
      case "rating":
        return arr.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
      case "popular":
        return arr.sort((a, b) => (b.reviews ?? 0) - (a.reviews ?? 0));
      case "ending":
      default:
        return arr.sort((a, b) => {
          const ea = a.id ? endAtByProductId.get(a.id) : undefined;
          const eb = b.id ? endAtByProductId.get(b.id) : undefined;
          const va = ea ? new Date(ea).getTime() : Number.POSITIVE_INFINITY;
          const vb = eb ? new Date(eb).getTime() : Number.POSITIVE_INFINITY;
          return va - vb;
        });
    }
  }, [filteredProducts, presentation, effectiveSort, endAtByProductId]);

  useEffect(() => {
    setVisibleCount(BATCH_SIZE);
  }, [quick, sort, query]);

  const visible = useMemo(
    () => sortedProducts.slice(0, visibleCount),
    [sortedProducts, visibleCount],
  );

  // Infinite scroll sentinel — no pagination, no "load more" button.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisibleCount((c) => Math.min(sortedProducts.length, c + BATCH_SIZE));
          }
        }
      },
      { rootMargin: "800px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [sortedProducts.length]);

  const renderProduct = useCallback(
    (p: Product, i: number) => (
      <BrowseCard
        key={p.id ?? p.slug}
        product={p}
        presentation={presentation.get(p.id ?? p.slug)}
        priority={i < 4}
        fallbackBadgeLabel="Flash Deal"
      />
    ),
    [presentation],
  );

  if (loading) {
    return <DealsSkeleton />;
  }

  return (
    <div className="min-h-screen pb-16 md:pb-24">
      {/* ── Sticky shopping header ── */}
      <div className="sticky top-[var(--app-header-h,4.75rem)] z-20 border-b border-white/[0.06] bg-background/85 backdrop-blur-xl">
        <div className="container-page py-3 sm:py-4">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-display text-[22px] font-bold uppercase leading-none tracking-[0.04em] text-foreground sm:text-[26px]">
                Flash Deals
              </h1>
              <p className="mt-1.5 text-[12px] text-muted-foreground sm:text-[13px]">
                Today's biggest savings
              </p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-accent/30 bg-accent/[0.08] px-3 py-1.5 text-[11px] font-semibold text-accent">
              <span className="inline-block size-1.5 rounded-full bg-emerald-400 motion-safe:animate-pulse" />
              <span className="tabular-nums">{dealProducts.length}</span> Live Deals
            </span>
          </div>

          {/* Search + sort */}
          <div className="mt-3 flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                inputMode="search"
                placeholder="Search flash deals"
                aria-label="Search flash deals"
                className="h-11 w-full rounded-full border border-white/10 bg-white/[0.04] pl-9 pr-9 text-[13px] text-foreground placeholder:text-muted-foreground focus:border-accent/50 focus:outline-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            <label className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] pl-3 pr-2 text-[11px] font-medium">
              <ArrowDownWideNarrow className="size-3.5 text-accent" />
              <span className="sr-only">Sort deals</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as DealSort)}
                className="appearance-none bg-transparent pr-1 text-[11px] font-mono uppercase tracking-widest focus:outline-none"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Quick filters */}
          <div className="-mx-1 mt-2.5 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-hide">
            {QUICK_FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setQuick(f.key)}
                aria-pressed={quick === f.key}
                className={`inline-flex min-h-[36px] shrink-0 items-center rounded-full px-3.5 text-[12px] font-medium transition-colors ${
                  quick === f.key
                    ? "border border-accent bg-accent text-accent-foreground"
                    : "border border-white/10 bg-white/[0.04] text-foreground/80 hover:border-accent/40 hover:text-accent"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Product grid ── */}
      <div className="container-page py-4 sm:py-6">
        {visible.length > 0 ? (
          <section id="deals-grid" data-product-card-frame>
            <div className="grid grid-cols-2 items-start gap-3 sm:gap-4 lg:grid-cols-4">
              {visible.map((p, i) => renderProduct(p, i))}
            </div>

            {visibleCount < sortedProducts.length && (
              <div ref={sentinelRef} className="mt-8 flex items-center justify-center py-6">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
                <span className="ml-2 text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
                  Loading more deals
                </span>
              </div>
            )}
            {visibleCount >= sortedProducts.length && sortedProducts.length > BATCH_SIZE && (
              <p className="mt-8 text-center text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
                You've reached the end · {sortedProducts.length} deals shown
              </p>
            )}
          </section>
        ) : (
          <EmptyDeals filtered={dealProducts.length > 0} onReset={() => { setQuick("all"); setQuery(""); }} />
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────  Skeleton  ───────────────────────── */

function DealsSkeleton() {
  return (
    <div className="container-page py-6">
      <div className="h-8 w-40 animate-pulse rounded-full bg-white/[0.06]" />
      <div className="mt-3 h-11 w-full animate-pulse rounded-full bg-white/[0.04]" />
      <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="aspect-square w-full animate-pulse rounded-[20px] bg-white/[0.05]" />
            <div className="h-3 w-3/4 animate-pulse rounded-full bg-white/[0.04]" />
            <div className="h-3 w-1/2 animate-pulse rounded-full bg-white/[0.04]" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────  Empty state  ───────────────────────── */

function EmptyDeals({ filtered, onReset }: { filtered: boolean; onReset: () => void }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-6 py-14 text-center sm:py-20">
      <div className="mb-5 inline-flex size-14 items-center justify-center rounded-full border border-accent/20 bg-accent/10 text-accent">
        <Flame className="size-6" />
      </div>
      <h2 className="font-display text-xl font-bold sm:text-2xl">
        {filtered ? "No deals match this filter" : "No Flash Deals right now"}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        {filtered
          ? "Try another quick filter or clear your search to see every live deal."
          : "New offers arrive every day. Check back soon — or browse what's trending in the meantime."}
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        {filtered ? (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-accent px-5 text-sm font-semibold text-accent-foreground"
          >
            Show all deals
          </button>
        ) : (
          <>
            <Link
              to="/products/best-sellers"
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-accent px-5 text-sm font-semibold text-accent-foreground"
            >
              <Star className="size-4" /> Best Sellers
              <ArrowRight className="size-4" />
            </Link>
            <Link
              to="/products/trending"
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-5 text-sm font-medium hover:border-accent/40 hover:text-accent"
            >
              <Zap className="size-4" /> Trending
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
