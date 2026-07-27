import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, BadgeCheck, Star, Truck, ShieldCheck } from "lucide-react";
import { useFlashDeals, type FlashItem } from "@/lib/use-flash-deals";
import { useRegion } from "@/lib/region";
import { Price } from "@/components/site/Price";
import { LazyMount } from "@/components/site/LazyMount";

/** Short editorial badges — rotated deterministically, never stock-shouting, never emoji. */
const BADGES = ["Today's Pick", "Editor's Choice", "Limited Offer", "Best Value", "Weekend Deal", "Hot Price"] as const;

function useDealPricing(item: FlashItem) {
  const { priceOf } = useRegion();
  const regular = priceOf(item.product);
  const deal = item.flashPrice != null && item.flashPrice > 0 ? item.flashPrice : regular;
  const off =
    regular > 0 && deal < regular ? Math.round(((regular - deal) / regular) * 100) : item.product.discount ?? 0;
  return { regular, deal, off, save: Math.max(0, regular - deal) };
}

/**
 * Unified showcase — one image presentation system for hero and mini cards.
 * The product floats on the card surface (no heavy boxed bed), sits on a soft
 * ember halo with a whisper reflection underneath, and is always
 * `object-contain` so nothing is ever cropped. The square box is reserved up
 * front so the fade-in can never shift layout.
 */
function DealShowcase({
  src,
  alt,
  padding,
  eager = false,
  reflection = true,
}: {
  src?: string | null;
  alt: string;
  /** Inner safe-zone padding in px so products never touch the edges. */
  padding: number;
  eager?: boolean;
  reflection?: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // Cached/instant images can fire `load` before React attaches the handler.
  useEffect(() => {
    const el = imgRef.current;
    if (el?.complete && el.naturalWidth > 0) setLoaded(true);
  }, [src]);

  return (
    <div className="relative aspect-square w-full">
      {/* Ambient halo behind the product */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-[10%] rounded-full opacity-[0.16] blur-2xl"
        style={{ background: "var(--gradient-ember)" }}
      />
      {src && (
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          onLoad={() => setLoaded(true)}
          className="absolute inset-0 size-full rounded-[18px] object-contain object-center transition-[transform,opacity] duration-[320ms] ease-out will-change-transform drop-shadow-[0_18px_26px_rgba(0,0,0,0.5)] motion-safe:group-hover:scale-[1.05]"
          style={{ opacity: loaded ? 1 : 0, padding }}
        />
      )}
      {/* Soft floor reflection */}
      {reflection && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-[18%] bottom-[4%] h-[7%] rounded-[50%] blur-md"
          style={{ background: "radial-gradient(closest-side, rgba(0,0,0,0.55), transparent)" }}
        />
      )}
    </div>
  );
}

/** Tiny, low-contrast inline trust row — icon + one word, no pills. */
function TrustRow() {
  return (
    <ul className="mt-3.5 flex items-center gap-4 text-[10px] font-medium text-muted-foreground/60">
      <li className="flex items-center gap-1">
        <BadgeCheck className="size-3.5 shrink-0 text-foreground/35" strokeWidth={1.75} aria-hidden />
        Verified
      </li>
      <li className="flex items-center gap-1">
        <Truck className="size-3.5 shrink-0 text-foreground/35" strokeWidth={1.75} aria-hidden />
        Fast Delivery
      </li>
      <li className="flex items-center gap-1">
        <ShieldCheck className="size-3.5 shrink-0 text-foreground/35" strokeWidth={1.75} aria-hidden />
        Returns
      </li>
    </ul>
  );
}

/**
 * Editorial hero — floating showcase left (45%), hierarchy right (55%):
 * badge → title → rating → price → trust → CTA.
 */
function HeroDeal({ item, index }: { item: FlashItem; index: number }) {
  const { regular, deal, off, save } = useDealPricing(item);
  const p = item.product;
  const badge = BADGES[index % BADGES.length];

  return (
    <Link
      to="/products/$slug"
      params={{ slug: p.slug }}
      aria-label={`${p.name} — flash deal${off > 0 ? `, ${off}% off` : ""}`}
      className="group relative flex min-h-[280px] w-[calc(100vw-32px)] max-w-[560px] shrink-0 snap-center items-center gap-5 overflow-hidden rounded-[30px] border border-white/[0.09] bg-card/50 p-5 backdrop-blur-2xl transition-[transform,border-color,box-shadow] duration-[240ms] ease-out will-change-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-[0.99] motion-safe:animate-fade-in motion-safe:hover:-translate-y-1.5 hover:border-white/[0.15] shadow-[0_34px_74px_-48px_rgba(0,0,0,0.95),0_2px_10px_-6px_rgba(0,0,0,0.6)] hover:shadow-[0_42px_92px_-44px_rgba(0,0,0,1)] sm:w-[540px] lg:min-h-[380px] lg:w-full lg:max-w-none lg:gap-10 lg:rounded-[32px] lg:p-9"
    >
      {/* Layered ambient depth: ember glow, top highlight, base fade */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(115% 78% at 18% 4%, color-mix(in oklab, var(--accent) 10%, transparent), transparent 62%), linear-gradient(180deg, rgba(255,255,255,0.055), transparent 30%), linear-gradient(0deg, rgba(0,0,0,0.26), transparent 42%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 rounded-[30px] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.09),inset_0_0_0_1px_rgba(255,255,255,0.03)] lg:rounded-[32px]"
      />

      {/* Showcase — 45% of hero width, vertically centered, floating */}
      <div className="w-[45%] shrink-0 self-center">
        <DealShowcase src={p.image} alt={p.name} padding={6} eager={index === 0} />
      </div>

      {/* 55% content column */}
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <span className="w-fit rounded-full border border-[hsl(30_35%_60%/0.24)] bg-[hsl(30_30%_55%/0.08)] px-2.5 py-[3px] text-[9px] font-semibold uppercase tracking-[0.18em] text-[hsl(35_45%_78%)] backdrop-blur-md">
          {badge}
        </span>

        <h3 className="mt-3.5 line-clamp-2 font-display text-[16px] font-semibold leading-[1.3] tracking-tight text-foreground/90 sm:text-[17px] lg:text-[21px]">
          {p.name}
        </h3>

        {(p.rating ?? 0) > 0 && (
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Star className="size-3 fill-foreground/55 text-foreground/55" strokeWidth={0} aria-hidden />
            <span className="font-semibold tabular-nums text-foreground/80">{p.rating.toFixed(1)}</span>
            <span className="tabular-nums">({(p.reviews ?? 0).toLocaleString()})</span>
          </div>
        )}

        {/* Price dominates */}
        <div className="mt-4">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <Price
              value={deal}
              className="font-display text-[30px] font-extrabold tabular-nums leading-none tracking-tight text-foreground lg:text-[40px]"
            />
            {off > 0 && (
              <span className="rounded-full border border-accent/20 bg-accent/[0.11] px-2 py-[2px] text-[10px] font-bold tabular-nums tracking-wide text-accent">
                {off}% OFF
              </span>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
            {deal < regular && (
              <Price
                value={regular}
                variant="compare"
                className="text-[11.5px] tabular-nums text-muted-foreground/50 line-through"
              />
            )}
            {save > 0 && (
              <p className="flex items-baseline gap-1 text-[11px] font-medium text-emerald-300/70">
                Save <Price value={save} variant="plain" className="tabular-nums" />
              </p>
            )}
          </div>
        </div>

        <TrustRow />

        <span className="mt-5 inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-[18px] bg-gradient-to-r from-accent to-accent/85 px-6 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-accent-foreground shadow-[0_18px_38px_-18px_rgba(255,138,0,0.8),inset_0_1px_0_0_rgba(255,255,255,0.22)] transition-[transform,box-shadow] duration-[180ms] ease-out group-hover:shadow-[0_22px_46px_-16px_rgba(255,138,0,0.9),inset_0_1px_0_0_rgba(255,255,255,0.26)] group-active:scale-[0.975] lg:max-w-[260px]">
          Grab Deal
          <ArrowRight
            className="size-4 transition-transform duration-[180ms] motion-safe:group-hover:translate-x-1"
            aria-hidden
          />
        </span>
      </div>
    </Link>
  );
}

/** Mini deal — same showcase system, ~70% image height, price left, arrow bottom-right. */
function MiniDeal({ item, index }: { item: FlashItem; index: number }) {
  const { deal, off } = useDealPricing(item);
  const p = item.product;

  return (
    <Link
      to="/products/$slug"
      params={{ slug: p.slug }}
      aria-label={p.name}
      style={{ animationDelay: `${index * 90}ms` }}
      className="group relative flex w-[46vw] max-w-[196px] shrink-0 snap-start flex-col overflow-hidden rounded-[22px] border border-white/[0.07] bg-card/45 p-2.5 backdrop-blur-md transition-[transform,border-color,box-shadow] duration-[220ms] ease-out will-change-transform motion-safe:animate-fade-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-[0.985] motion-safe:hover:-translate-y-1 hover:border-accent/25 shadow-[0_20px_42px_-36px_rgba(0,0,0,0.9),inset_0_1px_0_0_rgba(255,255,255,0.05)] hover:shadow-[0_26px_54px_-30px_rgba(0,0,0,0.95)] lg:w-full lg:max-w-none"
    >
      <DealShowcase src={p.image} alt={p.name} padding={6} />
      <div className="flex flex-col px-1 pb-0.5 pt-2">
        <p className="line-clamp-2 min-h-[30px] text-[11px] leading-[1.35] text-muted-foreground/85">{p.name}</p>
        <div className="mt-2 flex items-end justify-between gap-2">
          <div className="min-w-0">
            <Price value={deal} className="block font-display text-[16px] font-bold tabular-nums text-foreground" />
            {off > 0 && <span className="text-[10px] font-semibold tabular-nums text-accent">{off}% off</span>}
          </div>
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-foreground/70 transition-[color,border-color,transform] duration-200 group-hover:border-accent/40 group-hover:text-accent motion-safe:group-hover:translate-x-0.5">
            <ArrowRight className="size-3.5" aria-hidden />
          </span>
        </div>
      </div>
    </Link>
  );
}

/**
 * Flash Deals v5.0 — mobile-first premium editorial merchandising section.
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
      className="relative mx-auto max-w-7xl scroll-mt-24 pb-14 pt-12 motion-safe:animate-fade-in"
    >
      {/* Layered, near-invisible warm depth behind the hero */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(85% 50% at 50% 12%, color-mix(in oklab, var(--accent) 7%, transparent), transparent 70%), linear-gradient(180deg, rgba(255,255,255,0.018), transparent 30%)",
        }}
      />

      <header className="relative px-4 sm:px-6">
        <h2
          id="flash-deals-heading"
          className="font-display text-[25px] font-bold uppercase leading-none tracking-[0.06em] text-foreground sm:text-[32px]"
        >
          Flash Deals
        </h2>
        <p className="mt-2 text-[12px] text-muted-foreground sm:text-[13px]">Today's biggest savings</p>
      </header>

      <LazyMount minHeight={420}>
        {/* Desktop: editorial hero + compact rail. Mobile/tablet: hero carousel then rail. */}
        <div className="mt-8 lg:grid lg:grid-cols-[1.55fr_1fr] lg:gap-8 lg:px-6">
          <div
            ref={railRef}
            onScroll={onScroll}
            role="group"
            aria-label="Featured flash deals"
            className="flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto overscroll-x-contain px-4 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [-webkit-overflow-scrolling:touch] sm:px-6 lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden"
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

          {/* Desktop right column: compact rail */}
          <div className="hidden lg:grid lg:grid-cols-2 lg:content-start lg:gap-5">
            {[...heroes.slice(1), ...minis].slice(0, 4).map((item, i) => (
              <MiniDeal key={item.dealId ?? item.product.slug} item={item} index={i} />
            ))}
          </div>
        </div>

        {/* Thin animated progress capsules */}
        {heroes.length > 1 && (
          <div className="mt-6 flex items-center justify-center gap-1.5 lg:hidden" aria-hidden>
            {heroes.map((item, i) => (
              <span
                key={item.dealId ?? item.product.slug}
                className={`h-[3px] rounded-full transition-[width,background-color,box-shadow] duration-[320ms] ease-out ${
                  i === active
                    ? "w-9 bg-accent shadow-[0_0_12px_-2px_var(--accent)]"
                    : "w-4 bg-white/[0.14]"
                }`}
              />
            ))}
          </div>
        )}

        {minis.length > 0 && (
          <div className="mt-8 flex snap-x snap-mandatory scroll-px-4 gap-3.5 overflow-x-auto overscroll-x-contain px-4 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [-webkit-overflow-scrolling:touch] sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-6 lg:hidden [&::-webkit-scrollbar]:hidden">
            {minis.map((item, i) => (
              <MiniDeal key={item.dealId ?? item.product.slug} item={item} index={i} />
            ))}
          </div>
        )}

        {/* Centered outline explore action */}
        <div className="mt-9 flex justify-center px-4 sm:px-6">
          <Link
            to="/deals"
            className="group inline-flex h-11 items-center gap-2 rounded-full border border-accent/35 bg-transparent px-6 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-accent transition-[background-color,border-color,transform] duration-200 hover:border-accent/60 hover:bg-accent/[0.07] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            View All Flash Deals
            <ArrowRight
              className="size-4 transition-transform duration-[180ms] motion-safe:group-hover:translate-x-1"
              aria-hidden
            />
          </Link>
        </div>
      </LazyMount>
    </section>
  );
}
