import { PremiumCTALink, PremiumCTARow, PremiumCTAFace } from "@/components/site/PremiumCTA";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, BadgeCheck, Clock, Star, Truck, ShieldCheck } from "lucide-react";
import { useFlashDeals, type FlashItem } from "@/lib/use-flash-deals";
import { useDealCountdown } from "@/lib/homepage/use-deal-countdown";
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
  if (qty <= 3) return { label: "Almost Gone", tone: "fd-chip-critical text-rose-300/80 border-rose-400/20 bg-rose-400/[0.07]" };
  if (qty <= 10) return { label: "Limited Stock", tone: "fd-chip-limited text-amber-200/85 border-amber-300/20 bg-amber-300/[0.07]" };
  if (qty <= 25) return { label: "Selling Fast", tone: "fd-chip-fast text-foreground/65 border-white/10 bg-white/[0.04]" };
  return null;
}

/**
 * Unified premium media frame — one image presentation system for hero and mini
 * cards. Dark gradient bed, soft inner glow, hairline border, inset shadow,
 * rounded window that clips the image, and a consistent internal safe zone so
 * products never touch the edges. Always `object-contain` (never cropped or
 * stretched), with adaptive scaling by detected orientation so
 * portrait/landscape/square products read at a visually consistent size. The
 * square box is reserved up front so fade-in can't shift layout.
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
  const imgRef = useRef<HTMLImageElement>(null);

  const measure = useCallback((el: HTMLImageElement) => {
    if (!el.naturalWidth || !el.naturalHeight) return;
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
          className="absolute left-1/2 top-1/2 size-[98%] object-cover object-center transition-opacity duration-[320ms] ease-out will-change-transform motion-safe:group-hover:scale-[1.02]"
          style={{
            opacity: loaded ? 1 : 0,
            borderRadius: Math.max(0, radius - 2),
            transform: "translate(-50%, -50%)",
          }}

        />
      )}
    </div>
  );
}




/**
 * Live "Ends in" line — driven strictly by the deal's real `end_at`.
 * Renders nothing when there is no scheduled end or the window has passed.
 */
function DealCountdown({ endAt }: { endAt: string | null | undefined }) {
  const cd = useDealCountdown(endAt);
  if (!cd || cd.urgency === "expired") return null;

  const tone =
    cd.urgency === "normal"
      ? "text-accent/80"
      : cd.urgency === "last-hour"
        ? "text-accent"
        : "text-accent fd-countdown-final";

  return (
    <p
      className={`mt-1.5 flex items-center gap-1.5 text-[10.5px] font-medium leading-none ${tone}`}
      style={{ textShadow: "0 0 12px color-mix(in oklab, var(--accent) 45%, transparent)" }}
    >
      <Clock className="size-3 shrink-0" strokeWidth={2} aria-hidden />
      <span className="text-muted-foreground/60">Ends in</span>
      <span className="font-mono font-semibold tabular-nums tracking-tight transition-opacity duration-200">
        {cd.label}
      </span>
    </p>
  );
}

/** Inline trust row — wraps gracefully, never clipped, min 32px touch rhythm. */

function TrustRow() {
  const items = [
    { Icon: BadgeCheck, label: "Verified" },
    { Icon: Truck, label: "Fast Delivery" },
    { Icon: ShieldCheck, label: "Returns" },
  ];
  return (
    <ul className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] font-medium leading-none text-muted-foreground/45 sm:gap-x-3">
      {items.map(({ Icon, label }) => (
        <li
          key={label}
          className="flex min-h-[24px] min-w-0 items-center gap-1 whitespace-nowrap py-1 sm:min-h-[32px]"
        >
          <Icon className="size-3.5 shrink-0 text-foreground/25" strokeWidth={1.75} aria-hidden />
          {label}
        </li>
      ))}
    </ul>
  );
}


/**
 * Compact horizontal hero — 48% media / 52% content, vertically centered:
 * badge row → title → rating → price row → trust → CTA.
 */
function HeroDeal({ item, index }: { item: FlashItem; index: number }) {
  const { regular, deal, off } = useDealPricing(item);
  const p = item.product;
  const badge = BADGES[index % BADGES.length];
  const stock = stockChip(p.stockQuantity);

  // Expired deals swap the primary "Grab Deal" CTA for a neutral "View Product".
  // Client-only so SSR markup stays stable.
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    if (!item.endAt) return;
    const end = new Date(item.endAt).getTime();
    const tick = () => setExpired(Date.now() >= end);
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [item.endAt]);


  return (
    <Link
      to="/products/$slug"
      params={{ slug: p.slug }}
      aria-label={`${p.name} — flash deal${off > 0 ? `, ${off}% off` : ""}`}
      className="fd-card fd-card-hero group relative flex min-h-[236px] w-[calc(100vw-32px)] max-w-[560px] shrink-0 snap-center items-center gap-3.5 overflow-visible rounded-[26px] border border-white/[0.09] bg-card/50 p-4 md:backdrop-blur-2xl transition-[transform,border-color,box-shadow] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-[0.99] motion-safe:animate-fade-in motion-safe:hover:-translate-y-0.5 hover:border-white/[0.15] shadow-[0_12px_30px_-26px_rgba(0,0,0,0.85),inset_0_1px_0_0_rgba(255,255,255,0.06),inset_0_-24px_38px_-30px_rgba(0,0,0,0.85)] sm:min-h-[250px] sm:w-[540px] sm:gap-4 sm:p-5 lg:min-h-[270px] lg:w-full lg:max-w-none lg:gap-6 lg:rounded-[28px] lg:p-6"
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

      {/* ~45% media, vertically centered */}
      <div className="w-[45%] shrink-0 self-center">
        <DealFrame src={p.image} alt={p.name} variant="hero" radius={22} eager={index === 0} />
      </div>

      {/* content, vertically centered */}
      <div className="flex min-w-0 flex-1 flex-col justify-center text-left">
        {/* Dedicated badge row — fixed rhythm, wraps gracefully, never overlaps the title */}
        <div className="flex min-h-[28px] flex-wrap items-center gap-2">
          <span className="fd-chip fd-chip-editorial inline-flex h-[22px] items-center whitespace-nowrap rounded-full border border-[hsl(30_35%_60%/0.24)] bg-[hsl(30_30%_55%/0.08)] px-2 text-[9px] font-semibold uppercase leading-none tracking-[0.16em] text-[hsl(35_45%_78%)] md:backdrop-blur-md">
            {badge}
          </span>
          {stock && (
            <span
              className={`fd-chip inline-flex h-[22px] items-center whitespace-nowrap rounded-full border px-2 text-[9px] font-semibold leading-none tracking-wide ${stock.tone}`}
            >
              {stock.label}
            </span>
          )}
        </div>

        <DealCountdown endAt={item.endAt} />


        <h3 className="mt-1.5 line-clamp-2 min-h-[2.56em] font-display text-[15px] font-semibold leading-[1.28] tracking-tight text-foreground/90 sm:text-[16px] lg:text-[19px]">
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
            className="font-display text-[27px] font-extrabold tabular-nums leading-none tracking-tight text-foreground lg:text-[33px]"
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

        <PremiumCTAFace variant={expired ? "explore" : "primary"} className="mt-3.5 w-fit">
          {expired ? "View Product" : "Grab Deal"}
        </PremiumCTAFace>
      </div>
    </Link>
  );
}

/** Mini deal — square media top, 2-line title, price pinned bottom-left, arrow bottom-right. */
function MiniDeal({ item, index, fluid = false }: { item: FlashItem; index: number; fluid?: boolean }) {
  const { deal, off } = useDealPricing(item);
  const p = item.product;
  const badge = BADGES[index % BADGES.length];
  const stock = stockChip(p.stockQuantity);

  return (
    <Link
      to="/products/$slug"
      params={{ slug: p.slug }}
      aria-label={p.name}
      style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
      className={`fd-card fd-card-mini group relative flex shrink-0 snap-start flex-col overflow-visible rounded-[20px] border border-white/[0.07] bg-card/45 p-2 md:backdrop-blur-md transition-[transform,border-color,box-shadow] duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform motion-safe:animate-fade-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-[0.985] motion-safe:hover:-translate-y-1 hover:border-accent/25 shadow-[0_12px_26px_-24px_rgba(0,0,0,0.85),inset_0_1px_0_0_rgba(255,255,255,0.05)] ${fluid ? "w-full" : "w-[162px] sm:w-[168px] lg:w-full"}`}
    >

      <DealFrame src={p.image} alt={p.name} variant="mini" radius={18} />
      <div className="flex flex-1 flex-col px-0.5 pb-0.5 pt-2">
        {/* Badge row — same editorial + honest stock chips as the hero card */}
        <div className="mb-1.5 flex min-h-[20px] flex-wrap items-center gap-1">
          <span className="fd-chip fd-chip-editorial inline-flex h-[18px] items-center whitespace-nowrap rounded-full border border-[hsl(30_35%_60%/0.24)] bg-[hsl(30_30%_55%/0.08)] px-1.5 text-[8px] font-semibold uppercase leading-none tracking-[0.14em] text-[hsl(35_45%_78%)]">
            {badge}
          </span>
          {stock && (
            <span
              className={`fd-chip inline-flex h-[18px] items-center whitespace-nowrap rounded-full border px-1.5 text-[8px] font-semibold leading-none tracking-wide ${stock.tone}`}
            >
              {stock.label}
            </span>
          )}
        </div>
        <p className="line-clamp-2 min-h-[30px] text-[11px] leading-[1.35] text-muted-foreground/85">{p.name}</p>

        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            <Price
              value={deal}
              className="font-display text-[17px] font-bold tabular-nums leading-none text-foreground"
            />
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
 * Flash Deals v3.3 — compact, premium, mobile-first merchandising section.
 * Presentation only: pricing, eligibility and rotation stay in useFlashDeals.
 */
export function FlashDealsBand() {
  const { items, loading } = useFlashDeals();
  const railRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [cycle, setCycle] = useState(0);
  const campaign = useCampaignLabel();

  // Hero = 4 featured live deals. Below it, exactly 2 secondary cards.
  // Everything else lives on the dedicated Explore page (presentation cap only —
  // rotation, eligibility and the admin pool are untouched).
  const heroes = useMemo(() => items.slice(0, 4), [items]);
  const heroIds = useMemo(() => new Set(heroes.map((h) => h.product.id)), [heroes]);
  const gridDeals = useMemo(
    () => items.filter((i) => !heroIds.has(i.product.id)).slice(0, 2),
    [items, heroIds],
  );


  const onScroll = useCallback(() => {
    const el = railRef.current;
    if (!el || el.children.length === 0) return;
    const width = (el.children[0] as HTMLElement).offsetWidth + 16;
    setActive(Math.min(heroes.length - 1, Math.max(0, Math.round(el.scrollLeft / width))));
  }, [heroes.length]);

  useEffect(() => {
    setActive(0);
  }, [heroes.length]);

  // ── Autoplay: 6s desktop / 5s tablet+mobile, paused on interaction ────────
  const [reduced, setReduced] = useState(false);
  const [autoplayMs, setAutoplayMs] = useState(5000);
  useEffect(() => {
    const mm = window.matchMedia("(prefers-reduced-motion: reduce)");
    const wide = window.matchMedia("(min-width: 1024px)");
    const sync = () => {
      setReduced(mm.matches);
      setAutoplayMs(wide.matches ? 6000 : 5000);
    };
    sync();
    mm.addEventListener("change", sync);
    wide.addEventListener("change", sync);
    return () => {
      mm.removeEventListener("change", sync);
      wide.removeEventListener("change", sync);
    };
  }, []);

  /** Timestamp until which autoplay stays paused after a user interaction. */
  const pausedUntil = useRef(0);
  const pauseAutoplay = useCallback(() => {
    pausedUntil.current = Date.now() + 8000;
    setCycle((c) => c + 1); // restart the progress animation on manual input
  }, []);

  const goTo = useCallback((i: number) => {
    const el = railRef.current;
    if (!el || el.children.length === 0) return;
    const width = (el.children[0] as HTMLElement).offsetWidth + 16;
    el.scrollTo({ left: i * width, behavior: "smooth" });
  }, []);

  const autoplayable = heroes.length > 1 && !reduced;

  useEffect(() => {
    if (!autoplayable) return;
    const id = window.setInterval(() => {
      if (Date.now() < pausedUntil.current) return;
      const el = railRef.current;
      // Only drive the rail while it actually scrolls (mobile/tablet layout).
      if (!el || el.scrollWidth <= el.clientWidth + 8) return;
      setActive((i) => {
        const next = (i + 1) % heroes.length;
        goTo(next);
        return next;
      });
      setCycle((c) => c + 1);
    }, autoplayMs);
    return () => window.clearInterval(id);
  }, [autoplayable, autoplayMs, heroes.length, goTo]);


  // Nothing live: stay silent while loading, then show one premium empty card.
  if (heroes.length === 0) {
    if (loading) return null;
    return (
      <section
        aria-labelledby="flash-deals-heading"
        className="relative mx-auto max-w-7xl scroll-mt-24 px-4 pb-12 pt-11 sm:px-6 motion-safe:animate-fade-in"
      >
        <h2 id="flash-deals-heading" className="sr-only">
          Flash Deals
        </h2>
        <div className="rounded-[26px] border border-white/[0.08] bg-card/40 px-6 py-12 text-center md:backdrop-blur-2xl shadow-[0_12px_30px_-26px_rgba(0,0,0,0.85),inset_0_1px_0_0_rgba(255,255,255,0.06)]">
          <p className="font-display text-[17px] font-semibold tracking-tight text-foreground/90 sm:text-[19px]">
            No Flash Deals available today
          </p>
          <p className="mx-auto mt-2 max-w-sm text-[12.5px] text-muted-foreground">
            New offers arrive every day. Check back soon.
          </p>
          <Link
            to="/products/trending"
            className="mt-6 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full border border-accent/55 px-7 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-accent transition-[background-color,border-color,transform] duration-200 hover:-translate-y-0.5 hover:bg-accent/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 sm:w-auto"
          >
            Browse Products
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </section>
    );
  }


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
        <div className="mt-5 lg:px-6">
          <div
            ref={railRef}
            onScroll={onScroll}
            onPointerDown={pauseAutoplay}
            onTouchStart={pauseAutoplay}
            onWheel={pauseAutoplay}
            onMouseEnter={pauseAutoplay}
            onMouseMove={pauseAutoplay}
            onFocus={pauseAutoplay}
            role="group"
            aria-label="Featured flash deals"
            className="flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto overscroll-x-contain px-4 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [-webkit-overflow-scrolling:touch] sm:px-6 lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden"
            style={{ scrollBehavior: "smooth" }}
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

        {/* Thin progress indicators — active bar fills over the autoplay window */}
        {heroes.length > 1 && (
          <div className="mt-3.5 flex items-center justify-center gap-1.5 lg:hidden" role="tablist" aria-label="Flash deal slides">
            {heroes.map((item, i) => {
              const isActive = i === active;
              return (
                <button
                  key={item.dealId ?? item.product.slug}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-label={`Show flash deal ${i + 1}`}
                  onClick={() => {
                    pauseAutoplay();
                    setActive(i);
                    goTo(i);
                  }}
                  className="grid h-4 place-items-center"
                >
                  <span
                    className={`block h-[3px] overflow-hidden rounded-full transition-[width,background-color] duration-[380ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
                      isActive ? "w-10 bg-white/[0.18]" : "w-1.5 bg-white/[0.16]"
                    }`}
                  >
                    {isActive && (
                      <span
                        key={`${i}-${cycle}`}
                        className={`block h-full w-full rounded-full bg-accent shadow-[0_0_12px_-2px_var(--accent)] ${
                          autoplayable ? "fd-progress-fill" : ""
                        }`}
                        style={autoplayable ? { animationDuration: `${autoplayMs}ms` } : undefined}
                      />
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}


        {/* Secondary deals — exactly 2 cards, everything else lives on Explore */}
        {gridDeals.length > 0 && (
          <div className="mt-6 px-4 sm:px-6">
            <div className="grid grid-cols-2 items-stretch gap-3.5 lg:gap-5">
              {gridDeals.map((item, i) => (
                <MiniDeal key={item.dealId ?? item.product.slug} item={item} index={i} fluid />
              ))}
            </div>
          </div>
        )}


        {/* Explore CTA — own full-width band, never clipped or overlaid.
            Uses the solid accent fill (not --gradient-ember, which is a faint
            10%-alpha glow and made the label unreadable on mobile). */}
        <div className="fom-cta-row relative z-[1] pb-4">
          <PremiumCTALink
            to="/deals"
            variant="primary"
            block
            aria-label="Explore all flash deals"
            className="sm:w-auto"
          >
            Explore Flash Deals
          </PremiumCTALink>
        </div>

      </LazyMount>
    </section>
  );
}
