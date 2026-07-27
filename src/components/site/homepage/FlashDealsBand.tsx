import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, BadgeCheck, RotateCcw, Star, Truck } from "lucide-react";
import { useFlashDeals, type FlashItem } from "@/lib/use-flash-deals";
import { useRegion } from "@/lib/region";
import { Price } from "@/components/site/Price";
import { LazyMount } from "@/components/site/LazyMount";

/** Honest, stock-derived urgency copy — hidden entirely when unsupported by data. */
function urgencyLabel(item: FlashItem): string | null {
  const qty = item.product.stockQuantity ?? 0;
  if (qty > 0 && qty <= 3) return "Almost Gone";
  if (qty > 0 && qty <= 10) return `Only ${qty} left`;
  if ((item.product.soldCount ?? 0) > 50) return "Selling Fast";
  return null;
}

function useDealPricing(item: FlashItem) {
  const { priceOf } = useRegion();
  const regular = priceOf(item.product);
  const deal = item.flashPrice != null && item.flashPrice > 0 ? item.flashPrice : regular;
  const off =
    regular > 0 && deal < regular ? Math.round(((regular - deal) / regular) * 100) : item.product.discount ?? 0;
  return { regular, deal, off };
}

/**
 * Mobile-first flagship deal card. Full-bleed width on phones, image dominates
 * the upper half, then a single vertical rhythm of badge → title → rating →
 * price → savings → trust → CTA.
 */
function HeroDeal({ item, index }: { item: FlashItem; index: number }) {
  const { regular, deal, off } = useDealPricing(item);
  const p = item.product;
  const urgency = urgencyLabel(item);

  return (
    <Link
      to="/products/$slug"
      params={{ slug: p.slug }}
      aria-label={`${p.name} — flash deal${off > 0 ? `, ${off}% off` : ""}`}
      className="group relative flex w-[calc(100vw-32px)] max-w-[520px] shrink-0 snap-center flex-col overflow-hidden rounded-[28px] border border-white/[0.06] bg-card/55 p-5 backdrop-blur-xl transition-[transform,border-color,box-shadow] duration-200 will-change-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-[0.985] motion-safe:hover:-translate-y-1 hover:border-white/[0.12] hover:shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)] sm:w-[460px]"
      data-slide={index}
    >
      {/* Image — dominant, centered, generous safe area */}
      <div className="relative flex h-[210px] w-full items-center justify-center sm:h-[240px]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-8 inset-y-6 rounded-full opacity-[0.14] blur-3xl"
          style={{ background: "var(--gradient-ember)" }}
        />
        {p.image && (
          <img
            src={p.image}
            alt={p.name}
            loading="lazy"
            decoding="async"
            width={520}
            height={520}
            className="relative size-full object-contain p-3 drop-shadow-[0_26px_44px_rgba(0,0,0,0.6)] transition-transform duration-[280ms] ease-out will-change-transform group-active:scale-[1.03]"
          />
        )}
      </div>

      {/* Deal badge — bronze glass, single accent moment */}
      <span className="mt-5 w-fit rounded-full border border-[hsl(30_35%_60%/0.28)] bg-[hsl(30_30%_55%/0.10)] px-3 py-1 text-[9.5px] font-semibold uppercase tracking-[0.2em] text-[hsl(35_45%_78%)] backdrop-blur-md">
        Limited Deal
      </span>

      <h3 className="mt-3 line-clamp-2 font-display text-[19px] font-bold leading-snug tracking-tight text-foreground">
        {p.name}
      </h3>

      {(p.rating ?? 0) > 0 && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Star className="size-3 fill-foreground/70 text-foreground/70" strokeWidth={0} aria-hidden />
          <span className="font-semibold tabular-nums text-foreground/90">{p.rating.toFixed(1)}</span>
          <span className="tabular-nums">({(p.reviews ?? 0).toLocaleString()})</span>
        </div>
      )}

      {/* Price block — hierarchy through typography, not colour */}
      <div className="mt-4">
        <Price
          value={deal}
          className="block font-display text-[34px] font-extrabold tabular-nums leading-none tracking-tight text-foreground"
        />
        {deal < regular && (
          <div className="mt-2 flex flex-col gap-0.5 text-[12px]">
            <span className="font-semibold tabular-nums text-foreground/85">
              Save <Price value={regular - deal} variant="plain" className="tabular-nums" />
              {off > 0 ? ` (${off}%)` : ""}
            </span>
            <span className="tabular-nums text-muted-foreground/80">
              Original <Price value={regular} variant="compare" className="text-muted-foreground/80 line-through" />
            </span>
          </div>
        )}
      </div>

      {urgency && <span className="mt-3 text-[11px] font-medium text-muted-foreground">{urgency}</span>}

      {/* Trust pills */}
      <div className="mt-4 flex flex-wrap gap-2">
        {[
          { Icon: BadgeCheck, label: "Verified" },
          { Icon: Truck, label: "Fast Delivery" },
          { Icon: RotateCcw, label: "Easy Returns" },
        ].map(({ Icon, label }) => (
          <span
            key={label}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.04] px-2.5 py-1 text-[10px] font-medium text-muted-foreground/90 backdrop-blur-md"
          >
            <Icon className="size-3" aria-hidden /> {label}
          </span>
        ))}
      </div>

      <span className="mt-5 inline-flex h-14 w-full items-center justify-center gap-2 rounded-[18px] bg-gradient-to-r from-accent to-accent/85 text-[13px] font-semibold uppercase tracking-[0.14em] text-accent-foreground shadow-[0_16px_38px_-18px_rgba(255,138,0,0.75)] transition-transform duration-200 group-active:scale-[0.98]">
        Grab Deal
        <ArrowRight className="size-4 transition-transform duration-200 motion-safe:group-hover:translate-x-1" aria-hidden />
      </span>
    </Link>
  );
}

/** Compact secondary deal — image, price, one-line title, tiny badge, arrow. */
function MiniDeal({ item }: { item: FlashItem }) {
  const { regular, deal, off } = useDealPricing(item);
  const p = item.product;

  return (
    <Link
      to="/products/$slug"
      params={{ slug: p.slug }}
      aria-label={`${p.name}${off > 0 ? ` — ${off}% off` : ""}`}
      className="group flex h-[230px] w-[170px] shrink-0 snap-center flex-col overflow-hidden rounded-[20px] border border-white/[0.06] bg-card/50 transition-[transform,border-color] duration-200 will-change-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-[0.985] motion-safe:hover:-translate-y-1 hover:border-white/[0.12] sm:w-full"
    >
      <div className="relative flex h-[112px] items-center justify-center p-3">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-5 rounded-full opacity-[0.09] blur-2xl"
          style={{ background: "var(--gradient-ember)" }}
        />
        {p.image && (
          <img
            src={p.image}
            alt={p.name}
            loading="lazy"
            decoding="async"
            className="relative size-full object-contain drop-shadow-[0_12px_22px_rgba(0,0,0,0.5)] transition-transform duration-300 will-change-transform group-active:scale-[1.03]"
          />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 px-3.5 pb-3.5">
        <Price value={deal} className="font-display text-[17px] font-bold tabular-nums text-foreground" />
        <p className="line-clamp-1 text-[12px] text-muted-foreground">{p.name}</p>
        {off > 0 && (
          <span className="w-fit rounded-full border border-[hsl(30_35%_60%/0.25)] bg-[hsl(30_30%_55%/0.08)] px-2 py-0.5 text-[9.5px] font-semibold tabular-nums tracking-wide text-[hsl(35_45%_78%)]">
            {off}% OFF
          </span>
        )}
        <span className="mt-auto inline-flex size-8 items-center justify-center self-end rounded-full border border-white/10 bg-white/[0.04] text-foreground/80 transition-colors duration-200 group-hover:border-accent/40 group-hover:text-accent">
          <ArrowRight className="size-3.5" aria-hidden />
        </span>
      </div>
    </Link>
  );
}

/**
 * Flash Deals v3.0 — mobile-first flagship band.
 * Presentation only: pricing, eligibility and rotation stay in useFlashDeals.
 */
export function FlashDealsBand() {
  const { items, loading } = useFlashDeals();
  const railRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const visible = useMemo(() => items.slice(0, 8), [items]);
  const heroes = useMemo(() => visible.slice(0, 4), [visible]);
  const minis = useMemo(() => visible.slice(4), [visible]);

  const onScroll = useCallback(() => {
    const el = railRef.current;
    if (!el || el.children.length === 0) return;
    const width = (el.children[0] as HTMLElement).offsetWidth + 16;
    setActive(Math.min(heroes.length - 1, Math.max(0, Math.round(el.scrollLeft / width))));
  }, [heroes.length]);

  useEffect(() => {
    setActive(0);
  }, [heroes.length]);

  if (loading || heroes.length === 0) return null;

  return (
    <section
      aria-labelledby="flash-deals-heading"
      className="relative mx-auto max-w-7xl scroll-mt-24 py-12 motion-safe:animate-fade-in"
    >
      {/* Ambient warm light — almost invisible */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(90% 55% at 50% 12%, color-mix(in oklab, var(--accent) 7%, transparent), transparent 72%)",
        }}
      />

      <header className="relative flex items-end justify-between gap-4 px-6">
        <div className="min-w-0">
          <h2
            id="flash-deals-heading"
            className="font-display text-[22px] font-semibold uppercase tracking-[0.14em] text-foreground sm:text-[28px]"
          >
            Flash Deals
          </h2>
          <p className="mt-1.5 text-[12px] text-muted-foreground sm:text-[13.5px]">Today's biggest savings</p>
        </div>
        <Link
          to="/deals"
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 text-[12px] font-medium text-accent transition-colors hover:text-accent/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          View All
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </header>

      <LazyMount minHeight={440}>
        <div
          ref={railRef}
          onScroll={onScroll}
          role="group"
          aria-label="Featured flash deals"
          className="relative mt-6 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [-webkit-overflow-scrolling:touch] sm:px-6 [&::-webkit-scrollbar]:hidden"
        >
          {heroes.map((item, i) => (
            <HeroDeal key={item.dealId ?? item.product.slug} item={item} index={i} />
          ))}
        </div>

        {heroes.length > 1 && (
          <div className="mt-5 flex justify-center gap-1.5" aria-hidden>
            {heroes.map((item, i) => (
              <span
                key={item.dealId ?? item.product.slug}
                className={`h-1.5 rounded-full transition-all duration-200 ${
                  i === active ? "w-6 bg-accent" : "w-1.5 bg-white/20"
                }`}
              />
            ))}
          </div>
        )}

        {minis.length > 0 && (
          <div className="mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [-webkit-overflow-scrolling:touch] sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-6 lg:grid-cols-4 [&::-webkit-scrollbar]:hidden">
            {minis.map((item) => (
              <MiniDeal key={item.dealId ?? item.product.slug} item={item} />
            ))}
          </div>
        )}
      </LazyMount>

      <div className="relative mt-9 flex justify-center px-6">
        <Link
          to="/deals"
          className="group inline-flex min-h-11 items-center gap-2 rounded-full border border-white/12 bg-white/[0.03] px-7 text-[11.5px] font-medium uppercase tracking-[0.16em] text-foreground/85 transition-[background-color,border-color] duration-200 hover:border-accent/45 hover:bg-accent/[0.06] hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          Explore All Deals
          <ArrowRight className="size-4 transition-transform duration-200 motion-safe:group-hover:translate-x-1" aria-hidden />
        </Link>
      </div>
    </section>
  );
}
