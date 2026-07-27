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
 * Unified luxury showcase frame — one image presentation system for hero and
 * mini cards. Soft dark gradient bed, thin border, whisper-soft ember glow,
 * generous inner padding so the product never touches the corners, and
 * `object-contain` so nothing is ever cropped. The square box is reserved up
 * front so the fade-in can never shift layout.
 */
function DealImageFrame({
  src,
  alt,
  radius,
  padding,
  eager = false,
  children,
}: {
  src?: string | null;
  alt: string;
  /** Outer frame radius in px. */
  radius: number;
  /** Inner safe-zone padding in px. */
  padding: number;
  eager?: boolean;
  children?: React.ReactNode;
}) {
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // Cached/instant images can fire `load` before React attaches the handler.
  useEffect(() => {
    const el = imgRef.current;
    if (el?.complete && el.naturalWidth > 0) setLoaded(true);
  }, [src]);

  return (
    <div
      className="relative aspect-square w-full overflow-hidden border border-white/[0.07]"
      style={{
        borderRadius: radius,
        background:
          "linear-gradient(160deg, rgba(255,255,255,0.055), rgba(255,255,255,0.012) 42%, rgba(0,0,0,0.28))",
      }}
    >
      {/* Whisper-soft ember warmth behind the product */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-[16%] rounded-full opacity-[0.13] blur-2xl"
        style={{ background: "var(--gradient-ember)" }}
      />
      {/* Glass reflection */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/[0.06] to-transparent"
        style={{ borderTopLeftRadius: radius, borderTopRightRadius: radius }}
      />
      {src && (
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          onLoad={() => setLoaded(true)}
          className="absolute inset-0 size-full object-contain object-center transition-[transform,opacity] duration-[280ms] ease-out will-change-transform motion-safe:group-hover:scale-[1.04]"
          style={{ opacity: loaded ? 1 : 0, padding }}
        />
      )}
      {children}
    </div>
  );
}

/** Tiny, low-weight trust row — icon + one word. */
function TrustRow() {
  return (
    <ul className="mt-3 flex items-center gap-3.5 text-[10px] font-medium text-muted-foreground/70">
      <li className="flex items-center gap-1">
        <BadgeCheck className="size-3.5 shrink-0 text-foreground/45" strokeWidth={1.75} aria-hidden />
        Verified
      </li>
      <li className="flex items-center gap-1">
        <Truck className="size-3.5 shrink-0 text-foreground/45" strokeWidth={1.75} aria-hidden />
        Fast
      </li>
      <li className="flex items-center gap-1">
        <ShieldCheck className="size-3.5 shrink-0 text-foreground/45" strokeWidth={1.75} aria-hidden />
        Returns
      </li>
    </ul>
  );
}

/**
 * Editorial hero — showcase image left (42%), vertically-aligned hierarchy
 * right (58%). Everything fits without vertical scrolling inside the card.
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
      className="group relative flex w-[calc(100vw-32px)] max-w-[560px] shrink-0 snap-center items-center gap-4 overflow-hidden rounded-[28px] border border-white/[0.08] bg-card/45 p-4 backdrop-blur-xl transition-[transform,border-color,box-shadow] duration-[220ms] ease-out will-change-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-[0.99] motion-safe:animate-fade-in motion-safe:hover:-translate-y-1.5 hover:border-white/[0.14] shadow-[0_28px_64px_-46px_rgba(0,0,0,0.9)] hover:shadow-[0_34px_78px_-42px_rgba(0,0,0,0.95)] sm:w-[520px] lg:w-full lg:max-w-none lg:gap-9 lg:p-8"
    >
      {/* Layered ambient depth: ember glow, top highlight, base fade */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(120% 74% at 16% 0%, color-mix(in oklab, var(--accent) 8%, transparent), transparent 64%), linear-gradient(180deg, rgba(255,255,255,0.05), transparent 32%), linear-gradient(0deg, rgba(0,0,0,0.24), transparent 40%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 rounded-[28px] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08),inset_0_0_0_1px_rgba(255,255,255,0.03)]"
      />

      {/* Showcase — 42% of hero width, vertically centered */}
      <div className="w-[42%] shrink-0 self-center lg:w-[46%]">
        <DealImageFrame src={p.image} alt={p.name} radius={18} padding={14} eager={index === 0} />
      </div>

      {/* Vertical hierarchy: badge → title → rating → price block → trust → CTA */}
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <span className="w-fit rounded-full border border-[hsl(30_35%_60%/0.24)] bg-[hsl(30_30%_55%/0.08)] px-2.5 py-[3px] text-[9px] font-semibold uppercase tracking-[0.18em] text-[hsl(35_45%_78%)] backdrop-blur-md">
          {badge}
        </span>

        <h3 className="mt-3 line-clamp-2 font-display text-[17px] font-bold leading-[1.28] tracking-tight text-foreground/95 sm:text-[18px] lg:text-[22px]">
          {p.name}
        </h3>

        {(p.rating ?? 0) > 0 && (
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Star className="size-3 fill-foreground/60 text-foreground/60" strokeWidth={0} aria-hidden />
            <span className="font-semibold tabular-nums text-foreground/85">{p.rating.toFixed(1)}</span>
            <span className="tabular-nums">({(p.reviews ?? 0).toLocaleString()})</span>
          </div>
        )}

        {/* Price block — old price above, current price dominant, savings below */}
        <div className="mt-3.5">
          {deal < regular && (
            <Price
              value={regular}
              variant="compare"
              className="block text-[11.5px] tabular-nums text-muted-foreground/55 line-through"
            />
          )}
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <Price
              value={deal}
              className="font-display text-[28px] font-extrabold tabular-nums leading-none tracking-tight text-foreground lg:text-[36px]"
            />
            {off > 0 && (
              <span className="rounded-full border border-accent/20 bg-accent/[0.11] px-2 py-[2px] text-[10px] font-bold tabular-nums tracking-wide text-accent">
                {off}% OFF
              </span>
            )}
          </div>
          {save > 0 && (
            <p className="mt-1.5 flex items-baseline gap-1 text-[11px] font-medium text-emerald-300/75">
              Save <Price value={save} variant="plain" className="tabular-nums" />
            </p>
          )}
        </div>

        <TrustRow />

        <span className="mt-4 inline-flex h-[52px] w-full max-w-[190px] items-center justify-center gap-2 self-start rounded-full bg-gradient-to-r from-accent to-accent/85 px-6 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-foreground shadow-[0_16px_34px_-16px_rgba(255,138,0,0.75),inset_0_1px_0_0_rgba(255,255,255,0.2)] transition-transform duration-[180ms] ease-out group-active:scale-[0.97]">
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

/** Premium mini deal card — 70% showcase, price, one-line title, arrow. */
function MiniDeal({ item, index }: { item: FlashItem; index: number }) {
  const { deal } = useDealPricing(item);
  const p = item.product;

  return (
    <Link
      to="/products/$slug"
      params={{ slug: p.slug }}
      aria-label={p.name}
      style={{ animationDelay: `${index * 110}ms` }}
      className="group flex w-[42vw] max-w-[178px] shrink-0 snap-start flex-col overflow-hidden rounded-[22px] border border-white/[0.06] bg-card/40 p-2 backdrop-blur-md transition-[transform,border-color,box-shadow] duration-[220ms] ease-out will-change-transform motion-safe:animate-fade-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-[0.98] motion-safe:hover:-translate-y-1 hover:border-white/[0.12] shadow-[0_18px_38px_-34px_rgba(0,0,0,0.85),inset_0_1px_0_0_rgba(255,255,255,0.04)] lg:w-full lg:max-w-none"
    >
      <DealImageFrame src={p.image} alt={p.name} radius={16} padding={12} />
      <div className="flex flex-col px-1.5 pb-1 pt-2.5">
        <div className="flex items-center justify-between gap-2">
          <Price value={deal} className="font-display text-[15px] font-bold tabular-nums text-foreground" />
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-foreground/75 transition-[color,border-color,transform] duration-200 group-hover:border-accent/40 group-hover:text-accent motion-safe:group-hover:translate-x-0.5">
            <ArrowRight className="size-3.5" aria-hidden />
          </span>
        </div>
        <p className="mt-1 truncate text-[11px] leading-[1.35] text-muted-foreground/85">{p.name}</p>
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
      className="relative mx-auto max-w-7xl scroll-mt-24 pb-12 pt-10 motion-safe:animate-fade-in"
    >
      {/* Layered, near-invisible warm depth behind the hero */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(85% 50% at 50% 12%, color-mix(in oklab, var(--accent) 6%, transparent), transparent 70%), linear-gradient(180deg, rgba(255,255,255,0.018), transparent 30%)",
        }}
      />

      <header className="relative flex items-end justify-between gap-4 px-4 sm:px-6">
        <div className="min-w-0">
          <h2
            id="flash-deals-heading"
            className="font-display text-[25px] font-bold uppercase leading-none tracking-[0.08em] text-foreground sm:text-[32px]"
          >
            Flash Deals
          </h2>
          <p className="mt-2 text-[12px] text-muted-foreground sm:text-[13px]">Today's biggest savings</p>
        </div>
        <Link
          to="/deals"
          className="inline-flex shrink-0 items-center gap-1.5 py-2 text-[12px] font-medium text-accent transition-colors hover:text-accent/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          View All
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </header>

      <LazyMount minHeight={400}>
        {/* Desktop: editorial hero + compact rail. Mobile/tablet: hero carousel then rail. */}
        <div className="mt-7 lg:grid lg:grid-cols-[1.55fr_1fr] lg:gap-8 lg:px-6">
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

        {heroes.length > 1 && (
          <div className="mt-5 flex items-center justify-center gap-2 lg:hidden" aria-hidden>
            {heroes.map((item, i) => (
              <span
                key={item.dealId ?? item.product.slug}
                className={`h-[7px] rounded-full transition-[width,background-color] duration-300 ease-out ${
                  i === active ? "w-8 bg-accent shadow-[0_0_14px_-3px_var(--accent)]" : "w-[7px] bg-white/[0.16]"
                }`}
              />
            ))}
          </div>
        )}

        {minis.length > 0 && (
          <div className="mt-7 flex snap-x snap-mandatory scroll-px-4 gap-3.5 overflow-x-auto overscroll-x-contain px-4 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [-webkit-overflow-scrolling:touch] sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-6 lg:hidden [&::-webkit-scrollbar]:hidden">
            {minis.map((item, i) => (
              <MiniDeal key={item.dealId ?? item.product.slug} item={item} index={i} />
            ))}
          </div>
        )}
      </LazyMount>
    </section>
  );
}
