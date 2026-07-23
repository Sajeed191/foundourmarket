import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, memo } from "react";
import { X, Check, ShoppingBag, Scale, Plus, ChevronDown } from "lucide-react";
import { StarRating } from "@/components/site/StarRating";
import { useCompare } from "@/hooks/use-compare";
import { useProducts } from "@/lib/use-products";
import { resolveImage, fetchProductsBySlugs, type Product } from "@/lib/products";
import { useCart } from "@/lib/cart";

export const Route = createFileRoute("/compare")({
  head: () => ({
    meta: [
      { title: "Compare products — FoundOurMarket™" },
      { name: "description", content: "Compare features, prices and specifications side by side." },
      { property: "og:title", content: "Compare products — FoundOurMarket™" },
      { property: "og:description", content: "Compare features, prices and specifications side by side." },
    ],
  }),
  component: ComparePage,
});

/* ------------------------------- Helpers ------------------------------- */

const priceOf = (p: Product) => (p.discount ? p.price * (1 - p.discount / 100) : p.price);
const fmt = (n: number) => `$${n.toFixed(2)}`;
const NA = "Not Available";

function normalize(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return NA;
  if (typeof v === "number") return String(v);
  return v;
}

type Row = { label: string; values: string[] };

function differsOnly(rows: Row[]): Row[] {
  return rows.filter((r) => {
    const nonEmpty = r.values.filter((v) => v && v !== NA);
    if (nonEmpty.length === 0) return false;
    return new Set(r.values.map((v) => v.toLowerCase())).size > 1;
  });
}

function highlightsFor(p: Product): string[] {
  const explicit = (p as any).highlights;
  if (Array.isArray(explicit) && explicit.length) return explicit.slice(0, 5).map(String);
  const text = p.description || "";
  if (!text) return [];
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
  const sents = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 12 && s.length <= 140);
  return sents.slice(0, 5);
}

/* ----------------------------- UI Primitives ---------------------------- */

function Section({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="bg-card/60 border border-border rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <h2 className="text-[18px] font-display font-semibold tracking-tight">{title}</h2>
        <ChevronDown className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </section>
  );
}

const RowGrid = memo(function RowGrid({
  items,
  rows,
  emptyLabel = "No differences.",
}: {
  items: Product[];
  rows: Row[];
  emptyLabel?: string;
}) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  return (
    <div className="space-y-4">
      {rows.map((row) => (
        <div key={row.label} className="border-b border-border/40 last:border-b-0 pb-4 last:pb-0">
          <div className="text-[12px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-2.5">
            {row.label}
          </div>
          <div
            className="grid gap-3 sm:gap-4"
            style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
          >
            {row.values.map((v, i) => {
              const na = v === NA;
              return (
                <div
                  key={i}
                  className={`text-[15px] font-medium leading-snug break-words ${
                    na ? "text-muted-foreground/60 italic" : "text-foreground/90"
                  }`}
                >
                  {v}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
});

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
    return () => {
      active = false;
    };
  }, [slugs, products, full]);

  const items = useMemo(
    () =>
      slugs
        .map((s) => full[s] ?? products.find((p) => p.slug === s))
        .filter((p): p is Product => Boolean(p)),
    [slugs, products, full],
  );

  const highlights = useMemo(() => items.map(highlightsFor), [items]);

  /* -------------------- Comparison rows -------------------- */

  const generalRows = useMemo<Row[]>(() => {
    if (!items.length) return [];
    return [
      { label: "Price", values: items.map((p) => fmt(priceOf(p))) },
      { label: "Discount", values: items.map((p) => (p.discount ? `${p.discount}% off` : NA)) },
      { label: "Brand", values: items.map((p) => p.brand || NA) },
      { label: "Category", values: items.map((p) => p.category || NA) },
      { label: "Availability", values: items.map((p) => (p.inStock ? "In stock" : "Out of stock")) },
      {
        label: "Shipping",
        values: items.map((p) => (p.shippingFeeUsd ? `${fmt(p.shippingFeeUsd)} shipping` : "Free shipping")),
      },
      { label: "Warranty", values: items.map((p) => p.warranty || NA) },
    ];
  }, [items]);

  const ratingRows = useMemo<Row[]>(() => {
    if (!items.length) return [];
    return [
      {
        label: "Rating",
        values: items.map((p) => ((p.rating ?? 0) > 0 ? `${(p.rating ?? 0).toFixed(1)} / 5` : NA)),
      },
      { label: "Reviews", values: items.map((p) => `${p.reviews ?? 0} Reviews`) },
    ];
  }, [items]);

  const specRows = useMemo<Row[]>(() => {
    if (!items.length) return [];
    const keys = ["Material", "Color", "Size", "Weight", "Power", "Capacity", "Dimensions", "Model"];
    const rows = keys.map((k) => ({
      label: k,
      values: items.map((p) => {
        const s = (p.specifications || {}) as Record<string, string>;
        const a = ((p as any).attributes || {}) as Record<string, string>;
        return normalize(s[k] ?? s[k.toLowerCase()] ?? a[k] ?? a[k.toLowerCase()]);
      }),
    }));
    // Hide rows where every product is Not Available
    const filtered = rows.filter((r) => r.values.some((v) => v !== NA));
    return filtered.slice(0, 6);
  }, [items]);

  const priceRows = useMemo<Row[]>(() => {
    if (!items.length) return [];
    return [
      { label: "Current price", values: items.map((p) => fmt(priceOf(p))) },
      {
        label: "Original price",
        values: items.map((p) => (p.discount ? fmt(p.price) : NA)),
      },
      { label: "Discount", values: items.map((p) => (p.discount ? `${p.discount}% off` : NA)) },
      {
        label: "You save",
        values: items.map((p) => (p.discount ? fmt(p.price - priceOf(p)) : NA)),
      },
    ];
  }, [items]);

  const differences = useMemo<Row[]>(
    () => differsOnly([...generalRows, ...ratingRows, ...specRows]),
    [generalRows, ratingRows, specRows],
  );

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-14 pb-32 sm:pb-24">
      {/* Header */}
      <header className="mb-8 sm:mb-10">
        <h1 className="text-3xl md:text-4xl font-display font-semibold tracking-tight">
          Compare Products
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Compare features, prices and specifications side by side.
        </p>
        {items.length > 0 && (
          <div className="mt-5 flex items-center gap-4 flex-wrap">
            <span className="text-[13px] text-foreground/80 font-medium">
              {items.length} Product{items.length === 1 ? "" : "s"} Selected
            </span>
            <button
              onClick={clear}
              className="text-[13px] text-muted-foreground hover:text-foreground transition underline-offset-4 hover:underline"
            >
              Clear All
            </button>
            {!isFull && (
              <Link
                to="/"
                className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition"
              >
                <Plus className="size-3.5" /> Add Product
              </Link>
            )}
          </div>
        )}
      </header>

      {items.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-12 text-center">
          <div className="size-14 mx-auto mb-5 grid place-items-center rounded-full border border-border">
            <Scale className="size-5 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-medium mb-2">No products selected</h2>
          <p className="text-sm text-muted-foreground mb-6">
            {loading ? "Loading catalog…" : `Browse products and add up to ${max} items for comparison.`}
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
          {/* Product cards */}
          <div className="-mx-4 sm:mx-0 px-4 sm:px-0 mb-6">
            <div
              className="flex sm:grid gap-4 overflow-x-auto snap-x snap-mandatory sm:overflow-visible scrollbar-hide"
              style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
            >
              {items.map((p) => {
                const finalPrice = priceOf(p);
                return (
                  <div
                    key={p.id ?? p.slug}
                    className="snap-start shrink-0 sm:shrink w-[78vw] sm:w-auto bg-card border border-border rounded-2xl p-4 relative flex flex-col shadow-[0_6px_24px_-14px_rgba(0,0,0,0.5)]"
                  >
                    <button
                      onClick={() => remove(p.slug)}
                      aria-label={`Remove ${p.name}`}
                      className="absolute top-2.5 right-2.5 z-10 size-7 grid place-items-center rounded-full bg-background/70 backdrop-blur hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X className="size-3.5" />
                    </button>

                    <Link to="/products/$slug" params={{ slug: p.slug }} className="block">
                      <div className="aspect-square rounded-xl overflow-hidden bg-background mb-4">
                        {p.image && (
                          <img
                            loading="lazy"
                            decoding="async"
                            src={resolveImage(p.image)}
                            alt={p.name}
                            className="w-full h-full object-cover"
                          />
                        )}
                      </div>
                      <h3 className="text-[15px] font-medium leading-snug line-clamp-2 min-h-[2.6rem]">
                        {p.name}
                      </h3>
                    </Link>

                    <div className="mt-2.5">
                      <StarRating
                        rating={p.rating}
                        count={p.reviews}
                        showValue={p.rating > 0}
                        starClassName="size-3.5"
                        textClassName="text-xs"
                      />
                    </div>

                    <div className="mt-3 flex items-baseline gap-2 flex-wrap">
                      <span className="font-mono text-lg text-foreground font-semibold">
                        {fmt(finalPrice)}
                      </span>
                      {p.discount ? (
                        <>
                          <span className="text-muted-foreground font-mono text-xs line-through">
                            {fmt(p.price)}
                          </span>
                          <span className="text-[11px] font-medium text-emerald-500">
                            {p.discount}% off
                          </span>
                        </>
                      ) : null}
                    </div>

                    <div className="mt-2 text-xs text-muted-foreground">
                      {p.inStock ? (
                        <span className="inline-flex items-center gap-1 text-emerald-500">
                          <Check className="size-3" /> In stock
                        </span>
                      ) : (
                        <span className="text-muted-foreground/70">Out of stock</span>
                      )}
                    </div>

                    <div className="mt-auto pt-4">
                      <button
                        onClick={() => p.inStock && add(p.slug, 1)}
                        disabled={!p.inStock}
                        className="w-full inline-flex items-center justify-center gap-2 bg-accent text-accent-foreground h-11 rounded-full text-[12px] font-bold uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <ShoppingBag className="size-4" /> Add to Cart
                      </button>
                    </div>
                  </div>
                );
              })}
              {Array.from({ length: Math.max(0, 2 - items.length) }).map((_, i) => (
                <Link
                  to="/"
                  key={`ph-${i}`}
                  className="snap-start shrink-0 sm:shrink w-[78vw] sm:w-auto rounded-2xl border border-dashed border-border/60 grid place-items-center min-h-[320px] text-xs text-muted-foreground uppercase tracking-widest hover:border-foreground/40 hover:text-foreground transition"
                >
                  <span className="inline-flex items-center gap-2">
                    <Plus className="size-4" /> Add product
                  </span>
                </Link>
              ))}
            </div>
          </div>

          {/* Sections */}
          <div className="space-y-3">
            <Section title="General">
              <RowGrid items={items} rows={generalRows} />
            </Section>

            <Section title="Price">
              <RowGrid items={items} rows={priceRows} />
            </Section>

            <Section title="Ratings">
              <RowGrid items={items} rows={ratingRows} />
            </Section>

            {specRows.length > 0 && (
              <Section title="Specifications">
                <RowGrid items={items} rows={specRows} />
              </Section>
            )}

            <Section title="Highlights">
              <div
                className="grid gap-5"
                style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
              >
                {items.map((p, i) => (
                  <div key={`h-${p.slug}`} className="min-w-0">
                    <p className="text-[12px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-3 line-clamp-1">
                      {p.name}
                    </p>
                    {highlights[i].length ? (
                      <ul className="space-y-2">
                        {highlights[i].map((h, k) => (
                          <li
                            key={k}
                            className="flex gap-2 text-[14px] text-foreground/85 leading-relaxed"
                          >
                            <Check className="size-3.5 mt-0.5 shrink-0 text-emerald-500" />
                            <span className="break-words">{h}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground/70 italic">{NA}</p>
                    )}
                  </div>
                ))}
              </div>
            </Section>

            {items.length >= 2 && (
              <Section title="What's different" defaultOpen={false}>
                <RowGrid
                  items={items}
                  rows={differences}
                  emptyLabel="These products share the same key attributes."
                />
              </Section>
            )}
          </div>

          {/* Sticky bottom bar */}
          {items.length >= 2 && (
            <div className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/90 backdrop-blur-xl">
              <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-2 justify-between">
                <Link
                  to="/"
                  className="px-4 py-2 rounded-full border border-border text-[12px] font-medium hover:border-foreground/40 transition"
                >
                  ← Continue Shopping
                </Link>
                {!isFull && (
                  <Link
                    to="/"
                    className="inline-flex items-center gap-1.5 bg-foreground text-background px-4 py-2 rounded-full text-[12px] font-semibold hover:brightness-110 transition"
                  >
                    <Plus className="size-3.5" /> Add Product
                  </Link>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
