import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, BadgeCheck, Flame, ShieldCheck, Star, Truck } from "lucide-react";
import { useFlashDeals, type FlashItem } from "@/lib/use-flash-deals";
import { useRegion } from "@/lib/region";
import { Price } from "@/components/site/Price";
import { LazyMount } from "@/components/site/LazyMount";

/** Honest, stock-derived urgency copy — never a fake countdown. */
function urgencyLabel(item: FlashItem): string {
  const qty = item.product.stockQuantity ?? 0;
  if (qty > 0 && qty <= 3) return "Almost Gone";
  if (qty > 0 && qty <= 10) return `Only ${qty} Left`;
  if (qty > 0 && qty <= 20) return "Limited Stock";
  if (item.endAt) return "Ends Soon";
  if ((item.product.soldCount ?? 0) > 0) return "Selling Fast";
  return "Today's Pick";
}

function useDealPricing(item: FlashItem) {
  const { priceOf } = useRegion();
  const regular = priceOf(item.product);
  const deal = item.flashPrice != null && item.flashPrice > 0 ? item.flashPrice : regular;
  const off =
    regular > 0 && deal < regular ? Math.round(((regular - deal) / regular) * 100) : item.product.discount ?? 0;
  return { regular, deal, off };
}

/** Hero deal — image left, information right. Compact, editorial, premium. */
function HeroDeal({ item, index }: { item: FlashItem; index: number }) {
  const { regular, deal, off } = useDealPricing(item);
  const p = item.product;

  const step = (n: number) => ({
    animationDelay: `${n}ms`,
  });

  return (
    <Link
      to="/products/$slug"
      params={{ slug: p.slug }}
      aria-label={`${p.name} — flash deal${off > 0 ? `, ${off}% off` : ""}`}
      className="group relative flex w-[calc(100vw-24px)] max-w-[560px] shrink-0 snap-center items-stretch gap-3 overflow-hidden rounded-[24px] border border-white/[0.08] bg-card/70 p-3 backdrop-blur-xl transition-[border-color,box-shadow,transform] duration-200 will-change-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 hover:border-accent/35 hover:shadow-[0_24px_60px_-28px_rgba(255,138,0,0.35)] sm:w-[420px] sm:gap-4 sm:p-4"
    >
      {/* Floating discount bubble */}
      {off > 0 && (
        <span
          className="absolute right-3 top-3 z-10 rounded-full border border-accent/30 bg-gradient-to-br from-accent/25 to-accent/5 px-2.5 py-1 font-display text-[11px] font-bold tabular-nums text-accent backdrop-blur-md"
          aria-hidden
        >
          −{off}%
        </span>
      )}

      {/* Image — 42% mobile / 40% desktop */}
      <div
        className="relative w-[42%] shrink-0 overflow-hidden rounded-[18px] bg-muted/30 motion-safe:animate-fade-in sm:w-[40%]"
        style={step(220)}
      >
        {p.image && (
          <img
            src={p.image}
            alt={p.name}
            loading="lazy"
            decoding="async"
            width={320}
            height={320}
            className="size-full object-contain p-2 drop-shadow-[0_12px_24px_rgba(0,0,0,0.45)] transition-transform duration-300 motion-safe:group-hover:scale-[1.03]"
          />
        )}
      </div>

      {/* Information — 58% mobile / 60% desktop */}
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 py-1 pr-1">
        <span
          className="w-fit rounded-full border border-accent/25 bg-accent/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-accent motion-safe:animate-fade-in"
          style={step(240)}
        >
          Limited Deal
        </span>

        <h3
          className="line-clamp-2 font-display text-[14.5px] font-bold leading-snug tracking-tight text-foreground motion-safe:animate-fade-in sm:text-[16px]"
          style={step(240)}
        >
          {p.name}
        </h3>

        {(p.rating ?? 0) > 0 && (
          <div className="flex items-center gap-1 text-[10.5px] text-muted-foreground">
            <Star className="size-3 fill-accent text-accent" strokeWidth={0} aria-hidden />
            <span className="font-semibold tabular-nums text-foreground/90">{p.rating.toFixed(1)}</span>
            <span className="tabular-nums">({(p.reviews ?? 0).toLocaleString()})</span>
          </div>
        )}

        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 motion-safe:animate-fade-in" style={step(260)}>
          <Price value={deal} className="font-display text-[20px] font-extrabold tabular-nums text-foreground sm:text-[23px]" />
          {deal < regular && (
            <Price value={regular} variant="compare" className="text-[11px] text-muted-foreground line-through" />
          )}
        </div>

        {/* Urgency chip */}
        <span className="w-fit rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[9.5px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {urgencyLabel(item)}
        </span>

        {/* Trust row */}
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[9px] text-muted-foreground/80">
          <span className="inline-flex items-center gap-1">
            <BadgeCheck className="size-3" aria-hidden /> Verified
          </span>
          <span className="inline-flex items-center gap-1">
            <Truck className="size-3" aria-hidden /> Fast
          </span>
          <span className="inline-flex items-center gap-1">
            <ShieldCheck className="size-3" aria-hidden /> Protected
          </span>
        </div>

        <span
          className="mt-1 inline-flex min-h-11 w-fit items-center gap-1.5 rounded-full bg-gradient-to-r from-accent to-accent/80 px-4 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-accent-foreground transition-transform duration-200 motion-safe:animate-fade-in motion-safe:group-hover:translate-y-[-1px]"
          style={step(280)}
          data-slide={index}
        >
          Shop Deal
          <ArrowRight className="size-3.5" aria-hidden />
        </span>
      </div>
    </Link>
  );
}

/** Compact secondary deal — App Store style mini card. */
function MiniDeal({ item }: { item: FlashItem }) {
  const { regular, deal, off } = useDealPricing(item);
  const p = item.product;

  return (
    <Link
      to="/products/$slug"
      params={{ slug: p.slug }}
      aria-label={`${p.name} — ${off}% off`}
      className="group flex w-[132px] shrink-0 snap-start flex-col overflow-hidden rounded-[20px] border border-white/[0.07] bg-card/60 transition-[border-color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 hover:border-accent/35 sm:w-[150px]"
    >
      <div className="relative aspect-square overflow-hidden bg-muted/30">
        {p.image && (
          <img
            src={p.image}
            alt={p.name}
            loading="lazy"
            decoding="async"
            className="size-full object-cover transition-transform duration-300 motion-safe:group-hover:scale-[1.04]"
          />
        )}
        {off > 0 && (
          <span className="absolute left-1.5 top-1.5 rounded-full bg-black/70 px-1.5 py-0.5 text-[9px] font-bold text-accent ring-1 ring-accent/25">
            −{off}%
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-2">
        <p className="line-clamp-1 text-[11px] font-medium text-foreground">{p.name}</p>
        <div className="mt-auto flex items-baseline gap-1.5">
          <Price value={deal} className="font-display text-[13px] font-bold tabular-nums text-foreground" />
          {deal < regular && (
            <Price value={regular} variant="compare" className="text-[9.5px] text-muted-foreground line-through" />
          )}
        </div>
      </div>
    </Link>
  );
}

/**
 * Flash Deals v3.0 — flagship premium carousel.
 * Presentation only: pricing, eligibility and rotation stay in useFlashDeals.
 */
export function FlashDealsBand() {
  const { items, loading } = useFlashDeals();
  const railRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const visible = useMemo(() => items.slice(0, 8), [items]);
  const heroes = useMemo(() => visible.slice(0, 5), [visible]);
  const minis = useMemo(() => visible.slice(5), [visible]);

  const onScroll = useCallback(() => {
    const el = railRef.current;
    if (!el || el.children.length === 0) return;
    const width = (el.children[0] as HTMLElement).offsetWidth + 12;
    setActive(Math.min(heroes.length - 1, Math.max(0, Math.round(el.scrollLeft / width))));
  }, [heroes.length]);

  useEffect(() => {
    setActive(0);
  }, [heroes.length]);

  if (loading || heroes.length === 0) return null;

  return (
    <section
      aria-labelledby="flash-deals-heading"
      className="relative mx-auto max-w-7xl scroll-mt-24 py-8 sm:py-10"
    >
      {/* Very subtle warm radial depth */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-4 -top-8 h-56 rounded-full opacity-[0.03] blur-3xl"
        style={{ background: "var(--gradient-ember)" }}
      />

      <div className="relative flex items-end justify-between gap-3 px-3 sm:px-6">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Flame className="size-4 text-accent" strokeWidth={2} aria-hidden />
            <h2
              id="flash-deals-heading"
              className="truncate font-display text-[20px] font-semibold tracking-tight text-foreground sm:text-[26px]"
            >
              Flash Deals
            </h2>
          </div>
          <p className="mt-1 text-[11.5px] text-muted-foreground sm:text-[13px]">Today's biggest savings</p>
        </div>
        <Link
          to="/deals"
          className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-2 text-[11.5px] font-medium text-accent transition-colors hover:text-accent/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          View All
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>

      <LazyMount minHeight={260}>
        {/* Hero carousel — one deal per screen on mobile */}
        <div
          ref={railRef}
          onScroll={onScroll}
          role="group"
          aria-label="Featured flash deals"
          className="relative mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-3 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:px-6 [&::-webkit-scrollbar]:hidden"
        >
          {heroes.map((item, i) => (
            <HeroDeal key={item.dealId ?? item.product.slug} item={item} index={i} />
          ))}
        </div>

        {/* Slide indicators */}
        {heroes.length > 1 && (
          <div className="mt-3 flex justify-center gap-1.5" aria-hidden>
            {heroes.map((item, i) => (
              <span
                key={item.dealId ?? item.product.slug}
                className={`h-1.5 rounded-full transition-all duration-200 ${
                  i === active ? "w-5 bg-accent" : "w-1.5 bg-white/20"
                }`}
              />
            ))}
          </div>
        )}

        {/* Secondary mini rail */}
        {minis.length > 0 && (
          <div className="mt-5 flex snap-x gap-2.5 overflow-x-auto px-3 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:px-6 [&::-webkit-scrollbar]:hidden">
            {minis.map((item) => (
              <MiniDeal key={item.dealId ?? item.product.slug} item={item} />
            ))}
          </div>
        )}
      </LazyMount>

      <div className="relative mt-6 flex justify-center px-3 sm:px-6">
        <Link
          to="/deals"
          className="group inline-flex min-h-11 items-center gap-2 rounded-full border border-accent/35 bg-accent/[0.04] px-6 text-[11.5px] font-mono font-semibold uppercase tracking-[0.16em] text-accent transition-[background-color,border-color] duration-200 hover:border-accent/60 hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          Explore All Deals
          <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" />
        </Link>
      </div>
    </section>
  );
}
