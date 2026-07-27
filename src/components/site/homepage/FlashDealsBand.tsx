import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Star } from "lucide-react";
import { useFlashDeals, type FlashItem } from "@/lib/use-flash-deals";
import { useRegion } from "@/lib/region";
import { Price } from "@/components/site/Price";
import { LazyMount } from "@/components/site/LazyMount";

/** One short, elegant badge per hero — rotated deterministically, never stock-shouting. */
const BADGES = ["Limited Deal", "Today's Pick", "Hot Price", "Flash Pick", "Weekend Deal", "Best Value"] as const;

function useDealPricing(item: FlashItem) {
  const { priceOf } = useRegion();
  const regular = priceOf(item.product);
  const deal = item.flashPrice != null && item.flashPrice > 0 ? item.flashPrice : regular;
  const off =
    regular > 0 && deal < regular ? Math.round(((regular - deal) / regular) * 100) : item.product.discount ?? 0;
  return { regular, deal, off };
}

/**
 * Horizontal editorial hero — square image left (~38%), hierarchy right.
 * Everything fits without vertical scrolling inside the card.
 */
function HeroDeal({ item, index }: { item: FlashItem; index: number }) {
  const { regular, deal, off } = useDealPricing(item);
  const p = item.product;
  const badge = BADGES[index % BADGES.length];

  return (
    <Link
      to="/products/$slug"
      params={{ slug: p.slug }}
      aria-label={`${p.name} — flash deal${off > 0 ? `, ${off}% off` : ""}`}
      className="group relative flex w-[calc(100vw-32px)] max-w-[560px] shrink-0 snap-center items-center gap-3.5 overflow-hidden rounded-[26px] border border-white/[0.09] bg-card/50 p-3 backdrop-blur-xl transition-[transform,border-color,box-shadow] duration-200 will-change-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-[0.985] motion-safe:hover:-translate-y-1.5 hover:border-white/[0.15] shadow-[0_30px_70px_-46px_rgba(0,0,0,0.95)] hover:shadow-[0_38px_86px_-40px_rgba(0,0,0,0.98)] sm:w-[520px] lg:w-full lg:max-w-none lg:gap-6 lg:p-5"
    >
      {/* Ambient glow, top highlight, bottom fade */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(115% 72% at 18% 0%, color-mix(in oklab, var(--accent) 10%, transparent), transparent 62%), linear-gradient(180deg, rgba(255,255,255,0.055), transparent 34%), linear-gradient(0deg, rgba(0,0,0,0.28), transparent 42%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 rounded-[26px] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.09),inset_0_0_0_1px_rgba(255,255,255,0.035)]"
      />

      {/* Square image — ~48% of hero width, vertically centered */}
      <div className="relative aspect-square w-[48%] shrink-0 self-center overflow-hidden rounded-[19px] border border-white/[0.08] bg-white/[0.04] shadow-[0_16px_36px_-24px_rgba(0,0,0,0.9),inset_0_1px_0_0_rgba(255,255,255,0.07)]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-4 rounded-full opacity-[0.2] blur-2xl"
          style={{ background: "var(--gradient-ember)" }}
        />
        {/* Glass reflection */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-1/2 rounded-t-[19px] bg-gradient-to-b from-white/[0.07] to-transparent"
        />
        {p.image && (
          <img
            src={p.image}
            alt={p.name}
            loading="lazy"
            decoding="async"
            className="relative size-full object-contain p-1.5 drop-shadow-[0_18px_30px_rgba(0,0,0,0.55)] transition-transform duration-[260ms] ease-out will-change-transform motion-safe:group-hover:scale-[1.05]"
          />
        )}
      </div>



      {/* Content — name → price → discount → rating → CTA */}
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <span className="w-fit rounded-full border border-[hsl(30_35%_60%/0.26)] bg-[hsl(30_30%_55%/0.09)] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.2em] text-[hsl(35_45%_78%)] backdrop-blur-md">
          {badge}
        </span>

        <h3
          className="mt-2.5 line-clamp-2 font-display text-[18px] font-bold leading-[1.15] tracking-tight text-foreground sm:text-[20px] lg:text-[22px]"
          style={{
            maskImage: "linear-gradient(180deg, #000 76%, rgba(0,0,0,0.35) 100%)",
            WebkitMaskImage: "linear-gradient(180deg, #000 76%, rgba(0,0,0,0.35) 100%)",
          }}
        >
          {p.name}
        </h3>

        {(p.rating ?? 0) > 0 && (
          <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Star className="size-3 fill-foreground/70 text-foreground/70" strokeWidth={0} aria-hidden />
            <span className="font-semibold tabular-nums text-foreground/90">{p.rating.toFixed(1)}</span>
            <span className="tabular-nums">({(p.reviews ?? 0).toLocaleString()})</span>
          </div>
        )}

        <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <Price
            value={deal}
            className="font-display text-[27px] font-extrabold tabular-nums leading-none tracking-tight text-foreground lg:text-[32px]"
          />
          {deal < regular && (
            <Price
              value={regular}
              variant="compare"
              className="text-[12.5px] tabular-nums text-muted-foreground/60 line-through"
            />
          )}
          {off > 0 && (
            <span className="rounded-full border border-accent/25 bg-accent/[0.13] px-2 py-[3px] text-[10.5px] font-bold tabular-nums tracking-wide text-accent">
              {off}% OFF
            </span>
          )}
        </div>

        <span className="mt-3.5 inline-flex h-12 w-full max-w-[196px] items-center justify-center gap-2 self-start rounded-full bg-gradient-to-r from-accent to-accent/85 px-7 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-accent-foreground shadow-[0_14px_30px_-14px_rgba(255,138,0,0.8),inset_0_1px_0_0_rgba(255,255,255,0.22)] transition-transform duration-[180ms] ease-out group-active:scale-[0.96]">
          Grab Deal
          <ArrowRight className="size-4 transition-transform duration-[180ms] motion-safe:group-hover:translate-x-1" aria-hidden />
        </span>


      </div>
    </Link>
  );
}

/** Compact secondary card — image, 2-line name, price, circular arrow. */
function MiniDeal({ item, index }: { item: FlashItem; index: number }) {
  const { deal, off } = useDealPricing(item);
  const p = item.product;

  return (
    <Link
      to="/products/$slug"
      params={{ slug: p.slug }}
      aria-label={`${p.name}${off > 0 ? ` — ${off}% off` : ""}`}
      style={{ animationDelay: `${index * 120}ms` }}
      className="group flex w-[41vw] max-w-[172px] shrink-0 snap-start flex-col overflow-hidden rounded-[18px] border border-white/[0.07] bg-card/45 p-1.5 backdrop-blur-md transition-[transform,border-color,box-shadow] duration-200 will-change-transform motion-safe:animate-fade-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-[0.97] motion-safe:hover:-translate-y-1 hover:border-white/[0.14] shadow-[0_18px_40px_-34px_rgba(0,0,0,0.9),inset_0_1px_0_0_rgba(255,255,255,0.05)] hover:shadow-[0_24px_50px_-30px_rgba(0,0,0,0.95)] lg:w-full lg:max-w-none"
    >
      {/* Image occupies ~75% of the card */}
      <div className="relative aspect-square w-full shrink-0 overflow-hidden rounded-[13px] border border-white/[0.05] bg-white/[0.035]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-1/2 rounded-t-[13px] bg-gradient-to-b from-white/[0.06] to-transparent"
        />
        {p.image && (
          <img
            src={p.image}
            alt={p.name}
            loading="lazy"
            decoding="async"
            className="relative size-full object-contain p-1.5 transition-transform duration-300 will-change-transform motion-safe:group-hover:scale-[1.06]"
          />
        )}
        {off > 0 && (
          <span className="absolute left-1.5 top-1.5 rounded-full bg-accent/15 px-1.5 py-0.5 text-[9px] font-bold tabular-nums text-accent backdrop-blur-md">
            {off}%
          </span>
        )}
      </div>
      {/* Bottom ~25% — fixed rhythm so every card aligns */}
      <div className="flex flex-col px-1 pb-0.5 pt-1.5">
        <p className="line-clamp-2 h-[30px] text-[11.5px] leading-[1.3] text-muted-foreground">{p.name}</p>
        <div className="mt-1 flex items-center justify-between gap-2">
          <Price value={deal} className="font-display text-[15px] font-bold tabular-nums text-foreground" />
          <span className="inline-flex size-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-foreground/80 transition-colors duration-200 group-hover:border-accent/40 group-hover:text-accent">
            <ArrowRight className="size-3.5" aria-hidden />
          </span>
        </div>
      </div>


    </Link>
  );
}

/**
 * Flash Deals v3.0 — mobile-first editorial band.
 * Presentation only: pricing, eligibility and rotation stay in useFlashDeals.
 */
export function FlashDealsBand() {
  const { items } = useFlashDeals();
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

  if (heroes.length === 0) return null;

  return (
    <section
      aria-labelledby="flash-deals-heading"
      className="relative mx-auto max-w-7xl scroll-mt-24 pb-8 pt-8 motion-safe:animate-fade-in"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(90% 55% at 50% 10%, color-mix(in oklab, var(--accent) 7%, transparent), transparent 72%)",
        }}
      />

      <header className="relative flex items-end justify-between gap-4 px-4 sm:px-6">
        <div className="min-w-0">
          <h2
            id="flash-deals-heading"
            className="font-display text-[24px] font-bold uppercase leading-none tracking-[0.2em] text-foreground sm:text-[30px]"
          >
            Flash Deals
          </h2>
          <p className="mt-2.5 text-[12px] text-muted-foreground sm:text-[13px]">Today's biggest savings</p>
        </div>
        <Link
          to="/deals"
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 text-[12px] font-medium text-accent transition-colors hover:text-accent/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          View All
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </header>

      <LazyMount minHeight={380}>
        {/* Desktop: hero 60% + compact column. Mobile/tablet: hero carousel then rail. */}
        <div className="mt-6 lg:grid lg:grid-cols-[1.5fr_1fr] lg:gap-6 lg:px-6">

          <div
            ref={railRef}
            onScroll={onScroll}
            role="group"
            aria-label="Featured flash deals"
            className="flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [-webkit-overflow-scrolling:touch] sm:px-6 lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden"
          >
            {heroes.slice(0, 1).map((item, i) => (
              <HeroDeal key={item.dealId ?? item.product.slug} item={item} index={i} />
            ))}
            <div className="contents lg:hidden">
              {heroes.slice(1).map((item, i) => (
                <HeroDeal key={item.dealId ?? item.product.slug} item={item} index={i + 1} />
              ))}
            </div>
          </div>

          {/* Desktop right column: compact cards */}
          <div className="hidden lg:grid lg:grid-cols-2 lg:content-start lg:gap-4">
            {[...heroes.slice(1), ...minis].slice(0, 4).map((item, i) => (
              <MiniDeal key={item.dealId ?? item.product.slug} item={item} index={i} />
            ))}
          </div>
        </div>

        {heroes.length > 1 && (
          <div className="mt-4 flex justify-center gap-1.5 lg:hidden" aria-hidden>
            {heroes.map((item, i) => (
              <span
                key={item.dealId ?? item.product.slug}
                className={`h-1.5 rounded-full transition-all duration-300 ease-out ${
                  i === active ? "w-7 bg-accent shadow-[0_0_12px_-2px_var(--accent)]" : "w-1.5 bg-white/18"
                }`}
              />
            ))}
          </div>
        )}

        {minis.length > 0 && (
          <div className="mt-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [-webkit-overflow-scrolling:touch] sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-6 lg:hidden [&::-webkit-scrollbar]:hidden">

            {minis.map((item, i) => (
              <MiniDeal key={item.dealId ?? item.product.slug} item={item} index={i} />
            ))}
          </div>
        )}
      </LazyMount>
    </section>
  );
}
