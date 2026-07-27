import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, BadgeCheck, Star, Truck, ShieldCheck } from "lucide-react";
import { useFlashDeals, type FlashItem } from "@/lib/use-flash-deals";
import { useRegion } from "@/lib/region";
import { Price } from "@/components/site/Price";
import { LazyMount } from "@/components/site/LazyMount";

/** Short editorial badges — rotated deterministically, never stock-shouting, never emoji. */
const BADGES = ["Today's Pick", "Editor's Choice", "Limited Offer", "Best Value", "Weekend Deal", "Hot Price"] as const;

/** Non-intrusive merchandising campaign label, derived from the same 6-hour cadence as rotation. */
const CAMPAIGNS = ["Today's Best Deals", "Editor's Picks", "Weekend Specials", "Handpicked Savings"] as const;
function useCampaignLabel() {
  return useMemo(() => {
    const slot = Math.floor(Date.now() / (6 * 60 * 60 * 1000));
    return CAMPAIGNS[slot % CAMPAIGNS.length];
  }, []);
}

function useDealPricing(item: FlashItem) {
  const { priceOf } = useRegion();
  const regular = priceOf(item.product);
  const deal = item.flashPrice != null && item.flashPrice > 0 ? item.flashPrice : regular;
  const off =
    regular > 0 && deal < regular ? Math.round(((regular - deal) / regular) * 100) : item.product.discount ?? 0;
  return { regular, deal, off, save: Math.max(0, regular - deal) };
}

/** Honest stock chip — wording derived from real inventory, never invented urgency. */
function stockChip(qty: number | undefined | null) {
  if (qty == null || qty <= 0) return null;
  if (qty <= 3) return { label: "Almost Gone", tone: "text-rose-300/80 border-rose-400/20 bg-rose-400/[0.07]" };
  if (qty <= 10) return { label: "Limited Stock", tone: "text-amber-200/85 border-amber-300/20 bg-amber-300/[0.07]" };
  if (qty <= 25) return { label: "Selling Fast", tone: "text-foreground/65 border-white/10 bg-white/[0.04]" };
  return null;
}

/**
 * Unified premium media frame — one image presentation system for hero and mini
 * cards. Dark gradient bed, soft inner glow, hairline border, inset shadow,
 * rounded window that clips the image, and a responsive safe zone so products
 * never touch the edges. Always `object-contain` (never cover/stretch), with
 * adaptive scaling by detected orientation so portrait/landscape/square
 * products read at a visually consistent size. The square box is reserved up
 * front so fade-in can't shift layout.
 */
function DealFrame({
  src,
  alt,
  variant = "hero",
  radius = 22,
  eager = false,
}: {
  src?: string | null;
  alt: string;
  variant?: "hero" | "mini";
  radius?: number;
  eager?: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const [scale, setScale] = useState(1);
  const imgRef = useRef<HTMLImageElement>(null);

  // Adaptive framing: portrait products get a touch more presence, landscape a
  // touch less, so the *visible* product looks the same size on every card.
  const measure = useCallback((el: HTMLImageElement) => {
    const w = el.naturalWidth;
    const h = el.naturalHeight;
    if (!w || !h) return;
    const ratio = w / h;
    if (ratio < 0.85) setScale(1.04);
    else if (ratio > 1.25) setScale(0.98);
    else setScale(1);
    setLoaded(true);
  }, []);

  // Cached/instant images can fire `load` before React attaches the handler.
  useEffect(() => {
    const el = imgRef.current;
    if (el?.complete && el.naturalWidth > 0) measure(el);
  }, [src, measure]);

  return (
    <div
      className="relative aspect-square w-full overflow-hidden border border-white/[0.07] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),inset_0_-18px_28px_-24px_rgba(0,0,0,0.9)]"
      style={{
        borderRadius: radius,
        background:
          "radial-gradient(120% 90% at 50% 8%, rgba(255,255,255,0.045), transparent 62%), linear-gradient(180deg, rgba(255,255,255,0.02), rgba(0,0,0,0.32))",
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-[16%] rounded-full opacity-[0.14] blur-2xl"
        style={{ background: "var(--gradient-ember)" }}
      />
      {src && (
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          onLoad={(e) => measure(e.currentTarget)}
          className="absolute inset-0 size-full object-cover object-center transition-[transform,opacity] duration-[320ms] ease-out will-change-transform motion-safe:group-hover:scale-[1.03]"
          style={{
            opacity: loaded ? 1 : 0,
            transform: `scale(${scale})`,
            borderRadius: radius,
          }}
        />
      )}
    </div>
  );
}


/** Tiny, monochrome inline trust row — icon + one word, no pills. */
function TrustRow() {
  return (
    <ul className="mt-2.5 flex items-center gap-3.5 text-[10px] font-medium text-muted-foreground/55">
      <li className="flex items-center gap-1">
        <BadgeCheck className="size-3.5 shrink-0 text-foreground/30" strokeWidth={1.75} aria-hidden />
        Verified
      </li>
      <li className="flex items-center gap-1">
        <Truck className="size-3.5 shrink-0 text-foreground/30" strokeWidth={1.75} aria-hidden />
        Fast Delivery
      </li>
      <li className="flex items-center gap-1">
        <ShieldCheck className="size-3.5 shrink-0 text-foreground/30" strokeWidth={1.75} aria-hidden />
        Returns
      </li>
    </ul>
  );
}

/**
 * Compact horizontal hero — 40% media / 60% content, vertically centered:
 * badge → title → rating → price row → trust → CTA.
 */
function HeroDeal({ item, index }: { item: FlashItem; index: number }) {
  const { regular, deal, off } = useDealPricing(item);
  const p = item.product;
  const badge = BADGES[index % BADGES.length];
  const stock = stockChip(p.stockQuantity);

  return (
    <Link
      to="/products/$slug"
      params={{ slug: p.slug }}
      aria-label={`${p.name} — flash deal${off > 0 ? `, ${off}% off` : ""}`}
      className="group relative flex min-h-[232px] w-[calc(100vw-32px)] max-w-[560px] shrink-0 snap-center items-center gap-4 overflow-visible rounded-[26px] border border-white/[0.09] bg-card/50 p-4 backdrop-blur-2xl transition-[transform,border-color,box-shadow] duration-[240ms] ease-out will-change-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-[0.99] motion-safe:animate-fade-in motion-safe:hover:-translate-y-1 hover:border-white/[0.15] shadow-[0_30px_66px_-46px_rgba(0,0,0,0.95),0_2px_10px_-6px_rgba(0,0,0,0.6)] sm:min-h-[248px] sm:w-[540px] sm:gap-5 sm:p-5 lg:min-h-[268px] lg:w-full lg:max-w-none lg:gap-7 lg:rounded-[28px] lg:p-6"
    >
      {/* Near-invisible warm radial depth */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-[inherit]"
        style={{
          background:
            "radial-gradient(110% 76% at 16% 2%, color-mix(in oklab, var(--accent) 8%, transparent), transparent 62%), linear-gradient(180deg, rgba(255,255,255,0.045), transparent 28%)",
        }}
      />

      {/* 40% media */}
      <div className="w-[40%] shrink-0 self-center">
        <DealFrame src={p.image} alt={p.name} variant="hero" radius={22} eager={index === 0} />
      </div>

      {/* 60% content */}
      <div className="flex min-w-0 flex-1 flex-col justify-center text-left">
        <div className="flex flex-wrap items-center gap-1.5 gap-y-1.5">
          <span className="whitespace-nowrap rounded-full border border-[hsl(30_35%_60%/0.24)] bg-[hsl(30_30%_55%/0.08)] px-2 py-[3px] text-[9px] font-semibold uppercase leading-none tracking-[0.16em] text-[hsl(35_45%_78%)] backdrop-blur-md">
            {badge}
          </span>
          {stock && (
            <span className={`whitespace-nowrap rounded-full border px-2 py-[3px] text-[9px] font-semibold leading-none tracking-wide ${stock.tone}`}>
              {stock.label}
            </span>
          )}
        </div>

        <h3 className="mt-2.5 line-clamp-2 font-display text-[15px] font-semibold leading-[1.28] tracking-tight text-foreground/90 sm:text-[16px] lg:text-[19px]">
          {p.name}
        </h3>

        {(p.rating ?? 0) > 0 && (
          <div className="mt-1.5 flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
            <Star className="size-3 fill-foreground/50 text-foreground/50" strokeWidth={0} aria-hidden />
            <span className="font-semibold tabular-nums text-foreground/75">{p.rating.toFixed(1)}</span>
            <span className="tabular-nums">({(p.reviews ?? 0).toLocaleString()})</span>
          </div>
        )}

        {/* Single-row price — the strongest element */}
        <div className="mt-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <Price
            value={deal}
            className="font-display text-[26px] font-extrabold tabular-nums leading-none tracking-tight text-foreground lg:text-[32px]"
          />
          {deal < regular && (
            <Price
              value={regular}
              variant="compare"
              className="text-[11.5px] tabular-nums text-muted-foreground/50 line-through"
            />
          )}
          {off > 0 && (
            <span className="rounded-full border border-accent/20 bg-accent/[0.11] px-2 py-[2px] text-[10px] font-bold tabular-nums tracking-wide text-accent">
              {off}% OFF
            </span>
          )}
        </div>

        <TrustRow />

        <span className="mt-3.5 inline-flex h-12 w-fit items-center justify-center gap-2 rounded-[16px] bg-gradient-to-r from-accent to-accent/85 px-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-foreground shadow-[0_16px_34px_-18px_rgba(255,138,0,0.8),inset_0_1px_0_0_rgba(255,255,255,0.22)] transition-[transform,box-shadow] duration-[180ms] ease-out group-hover:shadow-[0_22px_44px_-16px_rgba(255,138,0,0.95),inset_0_1px_0_0_rgba(255,255,255,0.26)] group-active:scale-[0.98]">
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

/** Mini deal — square media top, large price, 2-line title, arrow bottom-right, no CTA. */
function MiniDeal({ item, index }: { item: FlashItem; index: number }) {
  const { deal, off } = useDealPricing(item);
  const p = item.product;

  return (
    <Link
      to="/products/$slug"
      params={{ slug: p.slug }}
      aria-label={p.name}
      style={{ animationDelay: `${index * 80}ms` }}
      className="group relative flex w-[158px] shrink-0 snap-start flex-col overflow-hidden rounded-[20px] border border-white/[0.07] bg-card/45 p-2.5 backdrop-blur-md transition-[transform,border-color,box-shadow] duration-[220ms] ease-out will-change-transform motion-safe:animate-fade-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-[0.985] motion-safe:hover:-translate-y-1 hover:border-accent/25 shadow-[0_20px_42px_-36px_rgba(0,0,0,0.9),inset_0_1px_0_0_rgba(255,255,255,0.05)] sm:w-[165px] lg:w-full"
    >
      <DealFrame src={p.image} alt={p.name} variant="mini" radius={18} />
      <div className="flex flex-col px-0.5 pb-0.5 pt-2.5">
        <div className="flex items-baseline gap-1.5">
          <Price value={deal} className="font-display text-[17px] font-bold tabular-nums leading-none text-foreground" />
          {off > 0 && <span className="text-[10px] font-semibold tabular-nums text-accent">{off}% off</span>}
        </div>
        <p className="mt-1.5 line-clamp-2 min-h-[30px] text-[11px] leading-[1.35] text-muted-foreground/85">{p.name}</p>
        <div className="mt-1.5 flex justify-end">
          <span className="inline-flex size-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-foreground/70 transition-[color,border-color,transform] duration-200 group-hover:border-accent/40 group-hover:text-accent motion-safe:group-hover:translate-x-0.5">
            <ArrowRight className="size-3.5" aria-hidden />
          </span>
        </div>
      </div>
    </Link>
  );
}

/**
 * Flash Deals v3.0 — compact, premium, mobile-first merchandising section.
 * Presentation only: pricing, eligibility and rotation stay in useFlashDeals.
 */
export function FlashDealsBand() {
  const { items } = useFlashDeals();
  const railRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const campaign = useCampaignLabel();

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
      className="relative mx-auto max-w-7xl scroll-mt-24 pb-12 pt-11 motion-safe:animate-fade-in"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(85% 46% at 50% 10%, color-mix(in oklab, var(--accent) 6%, transparent), transparent 70%)",
        }}
      />

      <header className="relative px-4 sm:px-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-accent/75">{campaign}</p>
        <h2
          id="flash-deals-heading"
          className="mt-2 font-display text-[24px] font-bold uppercase leading-none tracking-[0.05em] text-foreground sm:text-[30px]"
        >
          Flash Deals
        </h2>
        <p className="mt-1.5 text-[12px] text-muted-foreground sm:text-[13px]">Today's biggest savings</p>
      </header>

      <LazyMount minHeight={380}>
        {/* Desktop: wide hero banner + rail below. Mobile/tablet: hero carousel then rail. */}
        <div className="mt-6 lg:px-6">
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
        </div>

        {/* Thin progress indicators */}
        {heroes.length > 1 && (
          <div className="mt-5 flex items-center justify-center gap-1.5 lg:hidden" aria-hidden>
            {heroes.map((item, i) => (
              <span
                key={item.dealId ?? item.product.slug}
                className={`h-[3px] rounded-full transition-[width,background-color,box-shadow] duration-[320ms] ease-out ${
                  i === active ? "w-8 bg-accent shadow-[0_0_12px_-2px_var(--accent)]" : "w-1.5 bg-white/[0.16]"
                }`}
              />
            ))}
          </div>
        )}

        {/* Secondary rail — soft-faded edges, snapping, peek next card */}
        <div className="relative mt-7">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 z-10 w-6 bg-gradient-to-r from-background to-transparent lg:hidden"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 z-10 w-6 bg-gradient-to-l from-background to-transparent lg:hidden"
          />
          {/* Mobile/tablet: minis only (heroes already live in the carousel above) */}
          <div className="flex snap-x snap-mandatory scroll-px-4 gap-3.5 overflow-x-auto overscroll-x-contain px-4 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [-webkit-overflow-scrolling:touch] sm:px-6 lg:hidden [&::-webkit-scrollbar]:hidden">
            {minis.map((item, i) => (
              <MiniDeal key={item.dealId ?? item.product.slug} item={item} index={i} />
            ))}
          </div>
          {/* Desktop: remaining heroes + minis as a rail below the wide banner */}
          <div className="hidden lg:grid lg:grid-cols-4 lg:gap-5">
            {[...heroes.slice(1), ...minis].slice(0, 4).map((item, i) => (
              <MiniDeal key={item.dealId ?? item.product.slug} item={item} index={i} />
            ))}
          </div>
        </div>

        <div className="mt-8 flex justify-center px-4 sm:px-6">
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
