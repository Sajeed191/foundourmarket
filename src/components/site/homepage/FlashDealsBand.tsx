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
 * Hero promotional card — stacked on mobile, image/content split from `sm` up.
 * Editorial, campaign-like: one badge, floating image, one price block,
 * one trust row, one full-width CTA.
 */
function HeroDeal({ item, index }: { item: FlashItem; index: number }) {
  const { regular, deal, off } = useDealPricing(item);
  const p = item.product;
  const urgency = urgencyLabel(item);
  const badge = off >= 40 ? "Best Value" : "Limited Deal";

  return (
    <Link
      to="/products/$slug"
      params={{ slug: p.slug }}
      aria-label={`${p.name} — flash deal${off > 0 ? `, ${off}% off` : ""}`}
      className="group relative flex w-[calc(100vw-32px)] max-w-[640px] shrink-0 snap-center flex-col overflow-hidden rounded-[24px] border border-white/[0.07] bg-card/60 p-4 backdrop-blur-xl transition-[transform,border-color,box-shadow] duration-200 will-change-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 motion-safe:hover:-translate-y-[3px] hover:border-white/[0.14] hover:shadow-[0_28px_70px_-34px_rgba(0,0,0,0.85)] sm:w-[560px] sm:flex-row sm:items-center sm:gap-6 sm:p-5"
      data-slide={index}
    >
      {/* Image — floating on a soft gradient bed, no visible box */}
      <div className="relative flex aspect-[16/10] w-full items-center justify-center sm:aspect-square sm:w-[45%] sm:shrink-0">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-4 rounded-full opacity-[0.16] blur-3xl"
          style={{ background: "var(--gradient-ember)" }}
        />
        {p.image && (
          <img
            src={p.image}
            alt={p.name}
            loading="lazy"
            decoding="async"
            width={480}
            height={480}
            className="relative size-full object-contain drop-shadow-[0_22px_38px_rgba(0,0,0,0.55)] transition-transform duration-[320ms] ease-out motion-safe:scale-[0.96] motion-safe:group-hover:scale-100"
          />
        )}
      </div>

      {/* Content */}
      <div className="mt-4 flex min-w-0 flex-1 flex-col sm:mt-0 sm:w-[55%]">
        <span className="w-fit rounded-full border border-accent/25 bg-accent/[0.08] px-2.5 py-1 text-[9.5px] font-semibold uppercase tracking-[0.18em] text-accent">
          {badge}
        </span>

        <h3 className="mt-3 line-clamp-2 font-display text-[16px] font-bold leading-snug tracking-tight text-foreground sm:text-[18px]">
          {p.name}
        </h3>

        {(p.rating ?? 0) > 0 && (
          <div className="mt-1.5 flex items-center gap-1 text-[10.5px] text-muted-foreground">
            <Star className="size-3 fill-foreground/70 text-foreground/70" strokeWidth={0} aria-hidden />
            <span className="font-semibold tabular-nums text-foreground/90">{p.rating.toFixed(1)}</span>
            <span className="tabular-nums">({(p.reviews ?? 0).toLocaleString()})</span>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <Price
            value={deal}
            className="font-display text-[26px] font-extrabold tabular-nums leading-none text-accent sm:text-[30px]"
          />
          {deal < regular && (
            <>
              <Price value={regular} variant="compare" className="text-[12px] text-muted-foreground line-through" />
              {off > 0 && (
                <span className="text-[12px] font-semibold tabular-nums text-foreground/70">{off}% off</span>
              )}
            </>
          )}
        </div>

        {urgency && (
          <span className="mt-2 text-[11px] font-medium text-muted-foreground">{urgency}</span>
        )}

        {/* Single trust row */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10.5px] text-muted-foreground/85">
          <span className="inline-flex items-center gap-1.5">
            <BadgeCheck className="size-3.5" aria-hidden /> Verified
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Truck className="size-3.5" aria-hidden /> Fast Delivery
          </span>
          <span className="inline-flex items-center gap-1.5">
            <RotateCcw className="size-3.5" aria-hidden /> Easy Returns
          </span>
        </div>

        <span className="mt-4 inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-accent to-accent/85 text-[12.5px] font-semibold uppercase tracking-[0.14em] text-accent-foreground shadow-[0_14px_34px_-16px_rgba(255,138,0,0.7)] transition-shadow duration-200 group-hover:shadow-[0_18px_44px_-14px_rgba(255,138,0,0.85)]">
          Grab Deal
          <ArrowRight className="size-4 transition-transform duration-200 motion-safe:group-hover:translate-x-1" aria-hidden />
        </span>
      </div>
    </Link>
  );
}

/** Secondary deal — richer, roomier flash-exclusive card. */
function MiniDeal({ item }: { item: FlashItem }) {
  const { regular, deal, off } = useDealPricing(item);
  const p = item.product;

  return (
    <Link
      to="/products/$slug"
      params={{ slug: p.slug }}
      aria-label={`${p.name}${off > 0 ? ` — ${off}% off` : ""}`}
      className="group flex w-[75vw] max-w-[260px] shrink-0 snap-start flex-col overflow-hidden rounded-[22px] border border-white/[0.07] bg-card/55 shadow-[0_18px_44px_-30px_rgba(0,0,0,0.9)] transition-[transform,border-color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 motion-safe:hover:-translate-y-[3px] hover:border-white/[0.14] hover:shadow-[0_26px_60px_-30px_rgba(0,0,0,0.95)] sm:w-full sm:max-w-none"
    >
      <div className="relative flex aspect-square items-center justify-center p-4">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-6 rounded-full opacity-[0.10] blur-2xl"
          style={{ background: "var(--gradient-ember)" }}
        />
        {p.image && (
          <img
            src={p.image}
            alt={p.name}
            loading="lazy"
            decoding="async"
            className="relative size-full object-contain drop-shadow-[0_14px_26px_rgba(0,0,0,0.5)] transition-transform duration-300 motion-safe:group-hover:scale-[1.04]"
          />
        )}
        {off > 0 && (
          <span className="absolute left-3 top-3 rounded-full bg-accent/[0.12] px-2 py-0.5 text-[10px] font-bold tabular-nums text-accent ring-1 ring-accent/25">
            −{off}%
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 px-4 pb-4">
        <p className="line-clamp-1 text-[12.5px] font-medium text-foreground">{p.name}</p>
        <div className="mt-auto flex items-end justify-between gap-2">
          <div className="flex min-w-0 flex-col">
            <Price value={deal} className="font-display text-[16px] font-bold tabular-nums text-accent" />
            {deal < regular && (
              <Price value={regular} variant="compare" className="text-[10.5px] text-muted-foreground line-through" />
            )}
          </div>
          <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-foreground transition-colors duration-200 group-hover:border-accent/40 group-hover:text-accent">
            <ArrowRight className="size-4" aria-hidden />
          </span>
        </div>
      </div>
    </Link>
  );
}

/**
 * Flash Deals v3.1 — flagship editorial campaign band.
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
      className="relative mx-auto max-w-7xl scroll-mt-24 py-10 motion-safe:animate-fade-in sm:py-12"
    >
      {/* Editorial header */}
      <header className="relative flex items-end justify-between gap-4 px-4 sm:px-6">
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

      <LazyMount minHeight={320}>
        {/* Hero carousel */}
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
          <div className="mt-4 flex justify-center gap-1.5" aria-hidden>
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

        {/* Secondary deals — carousel on mobile, grid from sm up */}
        {minis.length > 0 && (
          <div className="mt-7 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [-webkit-overflow-scrolling:touch] sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-6 lg:grid-cols-4 [&::-webkit-scrollbar]:hidden">
            {minis.map((item) => (
              <MiniDeal key={item.dealId ?? item.product.slug} item={item} />
            ))}
          </div>
        )}
      </LazyMount>

      <div className="relative mt-8 flex justify-center px-4 sm:px-6">
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
