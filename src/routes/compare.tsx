import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  X, Check, ShoppingBag, Scale, Plus, Trophy, Star,
  DollarSign, Package, Truck, Shield, Sparkles, GitCompareArrows,
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
      { name: "description", content: "Compare products side by side and confidently choose the best one." },
      { property: "og:title", content: "Compare products — FoundOurMarket™" },
      { property: "og:description", content: "Compare products side by side and confidently choose the best one." },
    ],
  }),
  component: ComparePage,
});

/* -------------------------------- Helpers -------------------------------- */

const priceOf = (p: Product) => (p.discount ? p.price * (1 - p.discount / 100) : p.price);
const fmt = (n: number) => `$${n.toFixed(2)}`;

function normalize(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "number") return String(v);
  return v;
}

/* ---------------------------- Winner (single) --------------------------- */

type WinnerReason = "Best Value" | "Lowest Price" | "Highest Rated" | "Most Popular";

function pickBestOverall(items: Product[]): { index: number; reason: WinnerReason } | null {
  if (items.length < 2) return null;
  // Score: value = rating / price (rating>0), then reviews, then discount
  const scored = items.map((p, i) => {
    const price = Math.max(priceOf(p), 0.01);
    const r = p.rating ?? 0;
    const rev = p.reviews ?? 0;
    const value = r > 0 ? (r / price) * 100 + Math.min(rev, 500) * 0.02 : 0;
    return { i, value, price, r, rev, discount: p.discount ?? 0 };
  });
  const anyRated = scored.some((s) => s.r > 0);
  if (anyRated) {
    const best = scored.reduce((a, b) => (b.value > a.value ? b : a));
    // Pick reason label based on what stands out
    const cheapest = scored.reduce((a, b) => (b.price < a.price ? b : a));
    const topRated = scored.reduce((a, b) => (b.r > a.r ? b : a));
    const mostRev = scored.reduce((a, b) => (b.rev > a.rev ? b : a));
    let reason: WinnerReason = "Best Value";
    if (best.i === topRated.i && best.r >= 4.5) reason = "Highest Rated";
    else if (best.i === mostRev.i && best.rev >= 100) reason = "Most Popular";
    else if (best.i === cheapest.i) reason = "Lowest Price";
    return { index: best.i, reason };
  }
  // No ratings — pick lowest price
  const cheapest = scored.reduce((a, b) => (b.price < a.price ? b : a));
  return { index: cheapest.i, reason: "Lowest Price" };
}

/* ------------------------------ Highlights ------------------------------- */

function highlightsFor(p: Product): string[] {
  const explicit = (p as any).highlights;
  if (Array.isArray(explicit) && explicit.length) return explicit.slice(0, 6).map(String);
  const text = p.description || "";
  if (!text) return [];
  // Split by lines/bullets/periods, prefer bullet-like lines
  const lines = text
    .split(/\r?\n|•|●|\*/)
    .map((s) => s.replace(/^[-–—\s]+/, "").trim())
    .filter((s) => s.length >= 8 && s.length <= 120);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const l of lines) {
    const k = l.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(l.replace(/[.;]+$/, ""));
    if (out.length >= 5) break;
  }
  if (out.length >= 3) return out;
  // Fallback: split by sentence
  const sents = text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length >= 12 && s.length <= 140);
  return sents.slice(0, 5);
}

/* ----------------------------- Rows / difference ----------------------------- */

type Row = { label: string; values: string[]; winner?: number; tone?: "green" | "amber" | "sky" };

function differsOnly(rows: Row[]): Row[] {
  return rows.filter((r) => new Set(r.values.map((v) => v.toLowerCase())).size > 1);
}

/* -------------------------------- Section -------------------------------- */

function SectionCard({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-card/60 border border-border rounded-[18px] p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3.5">
        <Icon className="size-4 text-muted-foreground" />
        <h2 className="text-[13px] font-display font-semibold tracking-tight">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function RowGrid({
  items,
  rows,
  colWidth = "minmax(110px, 150px)",
}: {
  items: Product[];
  rows: Row[];
  colWidth?: string;
}) {
  if (!rows.length) return <p className="text-xs text-muted-foreground">No differences.</p>;
  return (
    <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
      <div className="space-y-1.5 min-w-[520px] sm:min-w-0">
        {rows.map((row) => (
          <div
            key={row.label}
            className="grid gap-3 items-center py-2 border-b border-border/40 last:border-b-0"
            style={{ gridTemplateColumns: `${colWidth} repeat(${items.length}, minmax(0, 1fr))` }}
          >
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              {row.label}
            </div>
            {row.values.map((v, i) => {
              const isWin = row.winner === i;
              const toneCls =
                row.tone === "amber"
                  ? "text-amber-300"
                  : row.tone === "sky"
                    ? "text-sky-300"
                    : "text-emerald-300";
              return (
                <div key={i} className="text-sm min-w-0 break-words">
                  <span className={isWin ? `${toneCls} font-medium` : "text-foreground/85"}>
                    {v}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------- Page ---------------------------------- */

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

  const winner = useMemo(() => pickBestOverall(items), [items]);
  const highlights = useMemo(() => items.map(highlightsFor), [items]);

  /* -------------------- Derived comparison rows -------------------- */

  const priceRows = useMemo<Row[]>(() => {
    if (!items.length) return [];
    const finals = items.map(priceOf);
    const lowest = finals.indexOf(Math.min(...finals));
    const discounts = items.map((p) => p.discount ?? 0);
    const bestDisc = discounts.indexOf(Math.max(...discounts));
    const saved = items.map((p) => (p.discount ? p.price - priceOf(p) : 0));
    const bestSave = saved.indexOf(Math.max(...saved));
    const value = items.map((p) => ((p.rating ?? 0) > 0 ? (p.rating ?? 0) / Math.max(priceOf(p), 0.01) : 0));
    const bestVal = value.some((v) => v > 0) ? value.indexOf(Math.max(...value)) : -1;
    return [
      { label: "Current price", values: finals.map(fmt), winner: lowest, tone: "green" },
      {
        label: "Discount",
        values: items.map((p) => (p.discount ? `${p.discount}% off` : "—")),
        winner: discounts[bestDisc] > 0 ? bestDisc : undefined,
        tone: "green",
      },
      {
        label: "Money saved",
        values: items.map((p) => (p.discount ? fmt(p.price - priceOf(p)) : "—")),
        winner: saved[bestSave] > 0 ? bestSave : undefined,
        tone: "green",
      },
      {
        label: "Value score",
        values: value.map((v) => (v > 0 ? v.toFixed(2) : "—")),
        winner: bestVal >= 0 ? bestVal : undefined,
        tone: "amber",
      },
    ];
  }, [items]);

  const ratingRows = useMemo<Row[]>(() => {
    if (!items.length) return [];
    const ratings = items.map((p) => p.rating ?? 0);
    const reviews = items.map((p) => p.reviews ?? 0);
    const bestR = ratings.indexOf(Math.max(...ratings));
    const bestRev = reviews.indexOf(Math.max(...reviews));
    return [
      {
        label: "Rating",
        values: ratings.map((r) => (r > 0 ? `${r.toFixed(1)} / 5` : "—")),
        winner: ratings[bestR] > 0 ? bestR : undefined,
        tone: "amber",
      },
      {
        label: "Reviews",
        values: reviews.map((n) => String(n)),
        winner: reviews[bestRev] > 0 ? bestRev : undefined,
        tone: "amber",
      },
      {
        label: "Popularity",
        values: reviews.map((n) => (n >= 500 ? "Very high" : n >= 100 ? "High" : n >= 20 ? "Moderate" : n > 0 ? "New" : "—")),
      },
    ];
  }, [items]);

  const availabilityRows = useMemo<Row[]>(() => {
    if (!items.length) return [];
    return [
      { label: "Stock", values: items.map((p) => (p.inStock ? "Available" : "Out of stock")) },
      {
        label: "Delivery",
        values: items.map((p) => (p.shippingFeeUsd ? `${fmt(p.shippingFeeUsd)} shipping` : "Free shipping")),
        winner: (() => {
          const idx = items.findIndex((p) => !p.shippingFeeUsd);
          return idx >= 0 ? idx : undefined;
        })(),
        tone: "green",
      },
      { label: "Warranty", values: items.map((p) => p.warranty || "—") },
      { label: "Returns", values: items.map((p) => (p as any).returnPolicy || (p as any).returns || "Standard 7 days") },
    ];
  }, [items]);

  const detailRows = useMemo<Row[]>(() => {
    if (!items.length) return [];
    const keys: { label: string; get: (p: Product) => string }[] = [
      { label: "Brand", get: (p) => p.brand || "—" },
      { label: "Category", get: (p) => p.category || "—" },
    ];
    const specKeys = ["Model", "Material", "Color", "Weight", "Dimensions", "Country", "Country of origin", "Origin"];
    for (const k of specKeys) {
      keys.push({
        label: k,
        get: (p) => {
          const s = p.specifications || {};
          const a = (p as any).attributes || {};
          const hit =
            s[k] ??
            s[k.toLowerCase()] ??
            a[k] ??
            a[k.toLowerCase()] ??
            "—";
          return normalize(hit);
        },
      });
    }
    const rows = keys.map((k) => ({ label: k.label, values: items.map(k.get) }));
    // Only keep rows where at least one product has a value
    return rows.filter((r) => r.values.some((v) => v !== "—"));
  }, [items]);

  const differences = useMemo<Row[]>(() => {
    return differsOnly([...priceRows, ...ratingRows, ...availabilityRows, ...detailRows]);
  }, [priceRows, ratingRows, availabilityRows, detailRows]);

  /* -------------------- Sticky header shadow -------------------- */

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

  const addBest = () => {
    if (!winner) return;
    const p = items[winner.index];
    if (p?.inStock) add(p.slug, 1);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-14 pb-32 sm:pb-24">
      {/* Premium header */}
      <header className="mb-8 sm:mb-10">
        <p className="text-[10px] font-mono uppercase tracking-[0.32em] text-accent mb-3 inline-flex items-center gap-2">
          <GitCompareArrows className="size-3" /> Decision center
        </p>
        <h1 className="text-3xl md:text-5xl font-display font-semibold tracking-tight">Compare Products</h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-xl">
          Compare products side by side and confidently choose the best one.
        </p>
        {items.length > 0 && (
          <div className="mt-4 flex items-center gap-3">
            <span className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
              {items.length} Product{items.length === 1 ? "" : "s"} Selected
            </span>
            <button
              onClick={clear}
              className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground hover:text-accent transition"
            >
              Clear all
            </button>
            {!isFull && (
              <Link
                to="/"
                className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-widest text-muted-foreground hover:text-accent transition"
              >
                <Plus className="size-3" /> Add ({max - items.length} left)
              </Link>
            )}
          </div>
        )}
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
            Browse products
          </Link>
        </div>
      ) : (
        <>
          {/* Sticky compact header */}
          {stuck && (
            <div className="fixed top-0 inset-x-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-xl animate-fade-in">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5">
                <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
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
                        <p className="text-[11px] font-mono text-accent">{fmt(priceOf(p))}</p>
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
                const isBest = winner?.index === i;
                return (
                  <div
                    key={p.id ?? p.slug}
                    className={`snap-start shrink-0 sm:shrink w-[78vw] sm:w-auto bg-card rounded-[18px] p-4 relative flex flex-col transition-all ${
                      isBest
                        ? "border border-amber-400/50 shadow-[0_10px_40px_-15px_rgba(251,191,36,0.35)]"
                        : "border border-border"
                    }`}
                  >
                    <button
                      onClick={() => remove(p.slug)}
                      aria-label={`Remove ${p.name}`}
                      className="absolute top-2 right-2 z-10 size-7 grid place-items-center rounded-full bg-background/60 backdrop-blur hover:bg-white/10 text-muted-foreground hover:text-accent transition-colors"
                    >
                      <X className="size-3.5" />
                    </button>

                    {isBest && (
                      <div className="absolute top-2 left-2 z-10">
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/10 text-amber-300 px-2 py-0.5 text-[9px] font-mono uppercase tracking-widest">
                          <Trophy className="size-2.5" /> Best Overall
                        </span>
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
                      <h3 className="text-sm font-medium leading-snug line-clamp-2 min-h-[2.5rem]">{p.name}</h3>
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
                      <span className="font-mono text-base text-accent font-semibold">{fmt(finalPrice)}</span>
                      {p.discount ? (
                        <>
                          <span className="text-muted-foreground font-mono text-xs line-through">{fmt(p.price)}</span>
                          <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-400">
                            {p.discount}% off
                          </span>
                        </>
                      ) : null}
                    </div>

                    <div className="mt-auto pt-3">
                      <button
                        onClick={() => p.inStock && add(p.slug, 1)}
                        disabled={!p.inStock}
                        className="w-full inline-flex items-center justify-center gap-2 bg-accent text-accent-foreground px-3 py-2 rounded-full text-[11px] font-bold uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <ShoppingBag className="size-3.5" /> Add to cart
                      </button>
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

          {/* Comparison sections */}
          <div className="space-y-3">
            <SectionCard icon={DollarSign} title="Price">
              <RowGrid items={items} rows={priceRows} />
            </SectionCard>

            <SectionCard icon={Star} title="Ratings">
              <RowGrid items={items} rows={ratingRows} />
            </SectionCard>

            <SectionCard icon={Package} title="Availability">
              <RowGrid items={items} rows={availabilityRows} />
            </SectionCard>

            {detailRows.length > 0 && (
              <SectionCard icon={Shield} title="Product details">
                <RowGrid items={items} rows={detailRows} />
              </SectionCard>
            )}

            {/* Highlights */}
            <SectionCard icon={Sparkles} title="Product highlights">
              <div
                className="grid gap-4"
                style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
              >
                {items.map((p, i) => (
                  <div key={`h-${p.slug}`} className="min-w-0">
                    <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2 line-clamp-1">
                      {p.name}
                    </p>
                    {highlights[i].length ? (
                      <ul className="space-y-1.5">
                        {highlights[i].map((h, k) => (
                          <li key={k} className="flex gap-2 text-xs text-foreground/85 leading-relaxed">
                            <Check className="size-3 mt-0.5 shrink-0 text-emerald-400" />
                            <span className="break-words">{h}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-muted-foreground">No highlights available.</p>
                    )}
                  </div>
                ))}
              </div>
            </SectionCard>

            {/* What's different */}
            {items.length >= 2 && (
              <SectionCard icon={GitCompareArrows} title="What's different">
                {differences.length ? (
                  <RowGrid items={items} rows={differences} />
                ) : (
                  <p className="text-xs text-muted-foreground">These products share the same key attributes.</p>
                )}
              </SectionCard>
            )}

            {/* Recommendation */}
            {winner && (
              <section className="rounded-[18px] border border-amber-400/30 bg-gradient-to-br from-amber-400/[0.06] to-transparent p-5">
                <div className="flex items-center gap-2 mb-2.5">
                  <Trophy className="size-4 text-amber-300" />
                  <h2 className="text-[13px] font-display font-semibold tracking-tight">Recommended choice</h2>
                </div>
                <Link
                  to="/products/$slug"
                  params={{ slug: items[winner.index].slug }}
                  className="flex items-center gap-3 group"
                >
                  <div className="size-14 shrink-0 rounded-xl overflow-hidden bg-card border border-border">
                    {items[winner.index].image && (
                      <img
                        src={resolveImage(items[winner.index].image)}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium line-clamp-1 group-hover:text-accent transition">
                      {items[winner.index].name}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {winner.reason} — best balance of price, ratings, and value based on the products you're comparing.
                    </p>
                  </div>
                  <span className="ml-auto font-mono text-sm text-accent">{fmt(priceOf(items[winner.index]))}</span>
                </Link>
              </section>
            )}
          </div>

          {/* Sticky bottom action bar */}
          <div className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/90 backdrop-blur-xl">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-2 justify-between">
              <div className="hidden sm:flex flex-col">
                <span className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
                  {items.length} Product{items.length === 1 ? "" : "s"} · Compare Complete
                </span>
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <Link
                  to="/"
                  className="px-3 py-2 rounded-full border border-border text-[11px] font-mono uppercase tracking-widest hover:border-accent/50 hover:text-accent transition"
                >
                  Continue shopping
                </Link>
                <button
                  onClick={addBest}
                  disabled={!winner || !items[winner.index]?.inStock}
                  className="inline-flex items-center gap-1.5 bg-accent text-accent-foreground px-4 py-2 rounded-full text-[11px] font-bold uppercase tracking-widest hover:brightness-110 transition disabled:opacity-40"
                >
                  <ShoppingBag className="size-3.5" />
                  {winner ? "Add best choice" : "Add to cart"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
