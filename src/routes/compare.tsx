import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  X, Check, ShoppingBag, Scale, Plus, ChevronDown, ChevronUp,
  Trophy, Star, DollarSign, Percent, Package, Truck, Award,
} from "lucide-react";
import { StarRating } from "@/components/site/StarRating";
import { useCompare } from "@/hooks/use-compare";
import { useProducts } from "@/lib/use-products";
import { resolveImage, fetchProductsBySlugs, type Product } from "@/lib/products";
import { useCart } from "@/lib/cart";

export const Route = createFileRoute("/compare")({
  head: () => ({
    meta: [
      { title: "Compare products — FoundOurMarket™" },
      { name: "description", content: "Compare features, price and specifications side-by-side before purchasing." },
      { property: "og:title", content: "Compare products — FoundOurMarket™" },
      { property: "og:description", content: "Compare features, price and specifications before purchasing." },
    ],
  }),
  component: ComparePage,
});

/* --------------------------------- Types --------------------------------- */

type SpecRow = { key: string; label: string; values: (string | number | null)[] };
type SpecGroup = { id: string; label: string; icon: React.ComponentType<{ className?: string }>; rows: SpecRow[] };

/* -------------------------------- Helpers -------------------------------- */

const priceOf = (p: Product) => (p.discount ? p.price * (1 - p.discount / 100) : p.price);

function normalize(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "number") return String(v);
  return v;
}

function hasDifference(row: SpecRow) {
  const vals = row.values.map((v) => normalize(v).toLowerCase());
  return new Set(vals).size > 1;
}

function bestIndex<T>(items: T[], score: (t: T) => number, prefer: "max" | "min" = "max"): number {
  return items.reduce((best, cur, i) => {
    const a = score(cur), b = score(items[best]);
    return prefer === "max" ? (a > b ? i : best) : (a < b ? i : best);
  }, 0);
}

/* ---------------------------- Winners / summary --------------------------- */

type WinnerKey = "bestValue" | "lowestPrice" | "highestRated" | "bestDiscount";

function computeWinners(items: Product[]) {
  if (items.length < 2) return {} as Record<WinnerKey, number | undefined>;
  const lowest = bestIndex(items, priceOf, "min");
  const rated = bestIndex(items, (p) => p.rating ?? 0, "max");
  const disc = bestIndex(items, (p) => p.discount ?? 0, "max");

  // Best value = normalized (rating / price), require rating > 0
  const valueScores = items.map((p) => (p.rating ?? 0) > 0 ? (p.rating ?? 0) / Math.max(priceOf(p), 0.01) : 0);
  const value = valueScores.some((s) => s > 0)
    ? valueScores.indexOf(Math.max(...valueScores))
    : lowest;

  return {
    bestValue: value,
    lowestPrice: lowest,
    highestRated: (items[rated].rating ?? 0) > 0 ? rated : undefined,
    bestDiscount: (items[disc].discount ?? 0) > 0 ? disc : undefined,
  };
}

/* ------------------------------ Spec builder ------------------------------ */

function buildGroups(items: Product[]): SpecGroup[] {
  const pricing: SpecRow[] = [
    { key: "price", label: "Current price", values: items.map((p) => `$${priceOf(p).toFixed(2)}`) },
    { key: "orig", label: "Original price", values: items.map((p) => (p.discount ? `$${p.price.toFixed(2)}` : "—")) },
    { key: "discount", label: "Discount", values: items.map((p) => (p.discount ? `${p.discount}% off` : "—")) },
    { key: "save", label: "You save", values: items.map((p) => (p.discount ? `$${(p.price - priceOf(p)).toFixed(2)}` : "—")) },
  ];

  const ratings: SpecRow[] = [
    { key: "rating", label: "Rating", values: items.map((p) => (p.rating > 0 ? `${p.rating.toFixed(1)} / 5` : "—")) },
    { key: "reviews", label: "Reviews", values: items.map((p) => p.reviews ?? 0) },
  ];

  const shipping: SpecRow[] = [
    { key: "stock", label: "Availability", values: items.map((p) => (p.inStock ? "Available" : "Out of stock")) },
    { key: "shipInr", label: "Shipping (INR)", values: items.map((p) => (p.shippingFeeInr ? `₹${p.shippingFeeInr}` : "Free")) },
    { key: "shipUsd", label: "Shipping (USD)", values: items.map((p) => (p.shippingFeeUsd ? `$${p.shippingFeeUsd}` : "Free")) },
    { key: "warranty", label: "Warranty", values: items.map((p) => p.warranty || "—") },
  ];

  const general: SpecRow[] = [
    { key: "brand", label: "Brand", values: items.map((p) => p.brand ?? "—") },
    { key: "category", label: "Category", values: items.map((p) => p.category) },
    { key: "sku", label: "SKU", values: items.map((p) => p.sku ?? "—") },
  ];

  const specKeys = new Set<string>();
  const attrKeys = new Set<string>();
  items.forEach((p) => {
    Object.keys(p.specifications ?? {}).forEach((k) => specKeys.add(k));
    Object.keys(p.attributes ?? {}).forEach((k) => attrKeys.add(k));
  });
  const specRows: SpecRow[] = Array.from(specKeys).sort().map((k) => ({
    key: `spec:${k}`, label: k, values: items.map((p) => (p.specifications ?? {})[k] ?? "—"),
  }));
  const attrRows: SpecRow[] = Array.from(attrKeys).sort().map((k) => ({
    key: `attr:${k}`, label: k, values: items.map((p) => (p.attributes ?? {})[k] ?? "—"),
  }));

  const groups: SpecGroup[] = [
    { id: "pricing", label: "Pricing", icon: DollarSign, rows: pricing },
    { id: "ratings", label: "Ratings & Reviews", icon: Star, rows: ratings },
    { id: "shipping", label: "Shipping & Warranty", icon: Truck, rows: shipping },
    { id: "general", label: "General", icon: Package, rows: general },
  ];
  if (specRows.length) groups.push({ id: "specifications", label: "Specifications", icon: Award, rows: specRows });
  if (attrRows.length) groups.push({ id: "attributes", label: "Attributes", icon: Award, rows: attrRows });
  return groups;
}

/* -------------------------- Description with Read More -------------------------- */

function ExpandableText({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  if (!text || text === "—") return <span className="text-muted-foreground">—</span>;
  const isLong = text.length > 220;
  const shown = open || !isLong ? text : text.slice(0, 220).trimEnd() + "…";
  return (
    <div className="text-sm text-foreground/85 leading-relaxed">
      <p className="whitespace-pre-wrap break-words">{shown}</p>
      {isLong && (
        <button
          onClick={() => setOpen((v) => !v)}
          className="mt-1.5 text-[11px] font-mono uppercase tracking-widest text-accent hover:brightness-125"
        >
          {open ? "Read less" : "Read more"}
        </button>
      )}
    </div>
  );
}

/* ---------------------------------- Page ---------------------------------- */

const WINNER_META: Record<WinnerKey, { label: string; icon: React.ComponentType<{ className?: string }>; tone: string }> = {
  bestValue:    { label: "Best Value",    icon: Trophy,  tone: "text-amber-300 border-amber-400/30 bg-amber-400/10" },
  lowestPrice:  { label: "Lowest Price",  icon: DollarSign, tone: "text-emerald-300 border-emerald-400/30 bg-emerald-400/10" },
  highestRated: { label: "Highest Rated", icon: Star,    tone: "text-sky-300 border-sky-400/30 bg-sky-400/10" },
  bestDiscount: { label: "Best Discount", icon: Percent, tone: "text-fuchsia-300 border-fuchsia-400/30 bg-fuchsia-400/10" },
};

function ComparePage() {
  const { slugs, remove, clear, isFull, max } = useCompare();
  const { products, loading } = useProducts();
  const { add } = useCart();

  const [full, setFull] = useState<Record<string, Product>>({});
  useEffect(() => {
    const need = slugs.filter((s) => {
      const p = products.find((x) => x.slug === s);
      return p && (p.__lean || !p.description) && !full[s];
    });
    if (need.length === 0) return;
    let active = true;
    fetchProductsBySlugs(need).then((rows) => {
      if (!active) return;
      setFull((prev) => {
        const next = { ...prev };
        for (const r of rows) next[r.slug] = r;
        return next;
      });
    });
    return () => { active = false; };
  }, [slugs, products, full]);

  const items = useMemo(
    () => slugs.map((s) => full[s] ?? products.find((p) => p.slug === s)).filter((p): p is Product => Boolean(p)),
    [slugs, products, full],
  );

  const winners = useMemo(() => computeWinners(items), [items]);
  const groups = useMemo(() => (items.length ? buildGroups(items) : []), [items]);

  const [open, setOpen] = useState<Record<string, boolean>>({
    pricing: true, ratings: true, shipping: true, general: false, specifications: false, attributes: false,
  });

  // Sticky compact header — appears once product cards scroll past
  const cardsRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    if (!cardsRef.current || items.length === 0) return;
    const el = cardsRef.current;
    const onScroll = () => {
      const r = el.getBoundingClientRect();
      setStuck(r.bottom < 64);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [items.length]);

  const addAll = () => items.forEach((p) => p.inStock && add(p.slug, 1));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-14 pb-32 sm:pb-16">
      {/* Header */}
      <header className="mb-8 sm:mb-10">
        <p className="text-[10px] font-mono uppercase tracking-[0.32em] text-accent mb-3 inline-flex items-center gap-2">
          <Scale className="size-3" /> Side by side
        </p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-3xl md:text-5xl font-display font-semibold tracking-tight">Compare products</h1>
            <p className="mt-2 text-sm text-muted-foreground max-w-xl">
              Compare features, price and specifications before purchasing.
            </p>
          </div>
          {items.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
                {items.length} of {max} selected
              </span>
              <button
                onClick={clear}
                className="text-[11px] font-mono uppercase tracking-widest px-3 py-1.5 rounded-full border border-border hover:border-accent/50 hover:text-accent transition"
              >
                Clear all
              </button>
              {!isFull && (
                <Link
                  to="/"
                  className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-widest px-3 py-1.5 rounded-full border border-border hover:border-accent/50 hover:text-accent transition"
                >
                  <Plus className="size-3" /> Add
                </Link>
              )}
            </div>
          )}
        </div>
      </header>

      {items.length === 0 ? (
        <div className="bg-card border border-border rounded-[18px] p-12 text-center">
          <div className="size-14 mx-auto mb-5 grid place-items-center rounded-full border border-border">
            <Scale className="size-5 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-medium mb-2">No products selected</h2>
          <p className="text-sm text-muted-foreground mb-6">
            {loading ? "Loading catalog…" : "Browse products and add up to four items for comparison."}
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 bg-accent text-accent-foreground px-5 py-2.5 rounded-full text-xs uppercase tracking-widest font-bold hover:brightness-110 transition-all"
          >
            Browse Products
          </Link>
        </div>
      ) : (
        <>
          {/* Sticky compact header */}
          {stuck && (
            <div className="fixed top-0 inset-x-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-xl animate-fade-in">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5">
                <div
                  className="grid gap-3"
                  style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
                >
                  {items.map((p) => (
                    <Link
                      to="/products/$slug"
                      params={{ slug: p.slug }}
                      key={`s-${p.slug}`}
                      className="flex items-center gap-2 min-w-0"
                    >
                      <div className="size-9 shrink-0 rounded-md overflow-hidden bg-card border border-border">
                        {p.image && (
                          <img src={resolveImage(p.image)} alt="" className="w-full h-full object-cover" loading="lazy" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] leading-tight truncate">{p.name}</p>
                        <p className="text-[11px] font-mono text-accent">${priceOf(p).toFixed(2)}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Product cards */}
          <div ref={cardsRef} className="-mx-4 sm:mx-0 px-4 sm:px-0 mb-6">
            <div
              className="flex sm:grid gap-3 sm:gap-4 overflow-x-auto snap-x snap-mandatory sm:overflow-visible scrollbar-hide"
              style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
            >
              {items.map((p, i) => {
                const finalPrice = priceOf(p);
                const cardWinners = (Object.entries(winners) as [WinnerKey, number | undefined][])
                  .filter(([, idx]) => idx === i)
                  .map(([k]) => k);
                return (
                  <div
                    key={p.id ?? p.slug}
                    className="snap-start shrink-0 sm:shrink w-[78vw] sm:w-auto bg-card border border-border rounded-[18px] p-4 relative flex flex-col"
                  >
                    <button
                      onClick={() => remove(p.slug)}
                      aria-label={`Remove ${p.name}`}
                      className="absolute top-2 right-2 z-10 size-7 grid place-items-center rounded-full bg-background/60 backdrop-blur hover:bg-white/10 text-muted-foreground hover:text-accent transition-colors"
                    >
                      <X className="size-3.5" />
                    </button>

                    {/* Winner badges */}
                    {cardWinners.length > 0 && (
                      <div className="absolute top-2 left-2 z-10 flex flex-col gap-1">
                        {cardWinners.map((w) => {
                          const meta = WINNER_META[w];
                          const Icon = meta.icon;
                          return (
                            <span
                              key={w}
                              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-mono uppercase tracking-widest ${meta.tone}`}
                            >
                              <Icon className="size-2.5" /> {meta.label}
                            </span>
                          );
                        })}
                      </div>
                    )}

                    <Link to="/products/$slug" params={{ slug: p.slug }} className="block">
                      <div className="aspect-square rounded-xl overflow-hidden bg-background mb-3">
                        {p.image && (
                          <img
                            loading="lazy"
                            decoding="async"
                            src={resolveImage(p.image)}
                            alt={p.name}
                            className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                          />
                        )}
                      </div>
                      <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground capitalize">
                        {p.category}
                      </p>
                      <h3 className="text-sm font-medium leading-snug mt-1 line-clamp-2 min-h-[2.5rem]">{p.name}</h3>
                    </Link>

                    <div className="mt-2">
                      <StarRating
                        rating={p.rating}
                        count={p.reviews}
                        showValue={p.rating > 0}
                        starClassName="size-3"
                        textClassName="text-xs font-mono"
                      />
                    </div>

                    <div className="mt-2.5 flex items-baseline gap-2 flex-wrap">
                      <span className="font-mono text-base text-accent font-semibold">${finalPrice.toFixed(2)}</span>
                      {p.discount ? (
                        <>
                          <span className="text-muted-foreground font-mono text-xs line-through">
                            ${p.price.toFixed(2)}
                          </span>
                          <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-400">
                            {p.discount}% off
                          </span>
                        </>
                      ) : null}
                    </div>

                    <div className="mt-2 flex items-center gap-2 text-[11px] font-mono">
                      {p.inStock ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400">
                          <Check className="size-3" /> Available
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Out of stock</span>
                      )}
                      <span className="text-muted-foreground">
                        · {p.shippingFeeUsd ? `Ships $${p.shippingFeeUsd}` : "Free shipping"}
                      </span>
                    </div>

                    <div className="mt-auto pt-3 flex flex-col gap-2">
                      <button
                        onClick={() => p.inStock && add(p.slug, 1)}
                        disabled={!p.inStock}
                        className="w-full inline-flex items-center justify-center gap-2 bg-accent text-accent-foreground px-3 py-2 rounded-full text-[11px] font-bold uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <ShoppingBag className="size-3.5" /> Add to cart
                      </button>
                      <Link
                        to="/products/$slug"
                        params={{ slug: p.slug }}
                        className="w-full inline-flex items-center justify-center px-3 py-2 rounded-full border border-border text-[11px] font-mono uppercase tracking-widest hover:border-accent/50 hover:text-accent transition"
                      >
                        View product
                      </Link>
                    </div>
                  </div>
                );
              })}
              {Array.from({ length: Math.max(0, 2 - items.length) }).map((_, i) => (
                <Link
                  to="/"
                  key={`ph-${i}`}
                  className="snap-start shrink-0 sm:shrink w-[78vw] sm:w-auto rounded-[18px] border border-dashed border-border/60 grid place-items-center min-h-[280px] text-xs text-muted-foreground font-mono uppercase tracking-widest hover:border-accent/50 hover:text-accent transition"
                >
                  <span className="inline-flex items-center gap-2">
                    <Plus className="size-4" /> Add product
                  </span>
                </Link>
              ))}
            </div>
          </div>

          {/* Decision summary */}
          {items.length >= 2 && (
            <section className="mb-8 rounded-[18px] border border-border bg-gradient-to-br from-card/80 to-card/40 p-5 sm:p-6">
              <div className="flex items-center gap-2 mb-4">
                <Trophy className="size-4 text-amber-300" />
                <h2 className="text-sm font-display font-semibold uppercase tracking-widest">Decision summary</h2>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {(Object.keys(WINNER_META) as WinnerKey[]).map((k) => {
                  const idx = winners[k];
                  const meta = WINNER_META[k];
                  const Icon = meta.icon;
                  const p = idx !== undefined ? items[idx] : undefined;
                  return (
                    <div key={k} className="rounded-2xl border border-border bg-background/40 p-3.5">
                      <div className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9px] font-mono uppercase tracking-widest ${meta.tone}`}>
                        <Icon className="size-2.5" /> {meta.label}
                      </div>
                      {p ? (
                        <Link
                          to="/products/$slug"
                          params={{ slug: p.slug }}
                          className="mt-2.5 flex items-center gap-2.5 group"
                        >
                          <div className="size-11 shrink-0 rounded-lg overflow-hidden bg-card border border-border">
                            {p.image && (
                              <img src={resolveImage(p.image)} alt="" className="w-full h-full object-cover" loading="lazy" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-medium leading-tight line-clamp-2 group-hover:text-accent transition">
                              {p.name}
                            </p>
                            <p className="text-[11px] font-mono text-accent mt-0.5">${priceOf(p).toFixed(2)}</p>
                          </div>
                        </Link>
                      ) : (
                        <p className="mt-2.5 text-xs text-muted-foreground">Not enough data</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Grouped spec accordions */}
          <div className="space-y-3">
            {groups.map((g) => {
              const isOpen = open[g.id] ?? false;
              const Icon = g.icon;
              const diffCount = g.rows.filter(hasDifference).length;
              return (
                <div key={g.id} className="bg-card/60 border border-border rounded-[18px] overflow-hidden">
                  <button
                    onClick={() => setOpen((s) => ({ ...s, [g.id]: !isOpen }))}
                    className="w-full flex items-center justify-between px-4 sm:px-5 py-4 hover:bg-white/[0.02] transition"
                  >
                    <span className="inline-flex items-center gap-2.5">
                      <Icon className="size-4 text-muted-foreground" />
                      <span className="text-sm font-display font-semibold tracking-tight">{g.label}</span>
                      {diffCount > 0 && (
                        <span className="text-[10px] font-mono uppercase tracking-widest text-amber-300/90">
                          {diffCount} differ{diffCount === 1 ? "s" : ""}
                        </span>
                      )}
                    </span>
                    <span className="text-muted-foreground">
                      {isOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="border-t border-border overflow-x-auto">
                      {g.rows.map((row) => {
                        const diff = items.length > 1 && hasDifference(row);
                        return (
                          <div
                            key={row.key}
                            className={`grid px-3 sm:px-5 py-3.5 gap-3 border-b border-border/60 last:border-b-0 transition-colors ${diff ? "bg-amber-500/[0.035]" : ""}`}
                            style={{ gridTemplateColumns: `minmax(120px, 170px) repeat(${items.length}, minmax(0, 1fr))` }}
                          >
                            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground self-start pt-0.5">
                              {row.label}
                            </div>
                            {row.values.map((val, i) => {
                              const str = normalize(val);
                              return (
                                <div key={i} className="text-sm text-foreground/90 min-w-0">
                                  {str === "Available" ? (
                                    <span className="inline-flex items-center gap-1 text-emerald-400 text-xs font-mono uppercase tracking-widest">
                                      <Check className="size-3" /> Available
                                    </span>
                                  ) : str === "Out of stock" ? (
                                    <span className="text-muted-foreground text-xs font-mono uppercase tracking-widest">— Not available</span>
                                  ) : (
                                    <span className="break-words whitespace-pre-wrap">{str}</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Description group — bespoke expand */}
            <div className="bg-card/60 border border-border rounded-[18px] overflow-hidden">
              <button
                onClick={() => setOpen((s) => ({ ...s, description: !(s.description ?? true) }))}
                className="w-full flex items-center justify-between px-4 sm:px-5 py-4 hover:bg-white/[0.02] transition"
              >
                <span className="inline-flex items-center gap-2.5">
                  <Award className="size-4 text-muted-foreground" />
                  <span className="text-sm font-display font-semibold tracking-tight">Description</span>
                </span>
                <span className="text-muted-foreground">
                  {(open.description ?? true) ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                </span>
              </button>
              {(open.description ?? true) && (
                <div className="border-t border-border p-4 sm:p-5">
                  <div
                    className="grid gap-4"
                    style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
                  >
                    {items.map((p) => (
                      <div key={`desc-${p.slug}`} className="min-w-0">
                        <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2 line-clamp-1">
                          {p.name}
                        </p>
                        <ExpandableText text={p.description || ""} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Sticky bottom action bar */}
          <div className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/90 backdrop-blur-xl">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-2 justify-between">
              <span className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground hidden sm:block">
                {items.length} product{items.length === 1 ? "" : "s"} · Total ${items.reduce((s, p) => s + priceOf(p), 0).toFixed(2)}
              </span>
              <div className="flex items-center gap-2 ml-auto">
                <button
                  onClick={clear}
                  className="px-3 py-2 rounded-full border border-border text-[11px] font-mono uppercase tracking-widest hover:border-accent/50 hover:text-accent transition"
                >
                  Clear
                </button>
                {!isFull && (
                  <Link
                    to="/"
                    className="px-3 py-2 rounded-full border border-border text-[11px] font-mono uppercase tracking-widest hover:border-accent/50 hover:text-accent transition"
                  >
                    Compare another
                  </Link>
                )}
                <button
                  onClick={addAll}
                  disabled={!items.some((p) => p.inStock)}
                  className="inline-flex items-center gap-1.5 bg-accent text-accent-foreground px-4 py-2 rounded-full text-[11px] font-bold uppercase tracking-widest hover:brightness-110 transition disabled:opacity-40"
                >
                  <ShoppingBag className="size-3.5" /> Add all to cart
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
