import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Flame } from "lucide-react";
import { useFlashDeals, type FlashItem } from "@/lib/use-flash-deals";
import { useRegion } from "@/lib/region";
import { Price } from "@/components/site/Price";
import { LazyMount } from "@/components/site/LazyMount";

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

/** Honest, stock-derived urgency copy — never a fake countdown. */
function urgencyLabel(item: FlashItem): string {
  const qty = item.product.stockQuantity ?? 0;
  if (qty > 0 && qty <= 5) return "Almost Gone";
  if (qty > 0 && qty <= 15) return "Limited Quantity";
  if (item.endAt) return "Ends Soon";
  if ((item.product.soldCount ?? 0) > 0) return "Selling Fast";
  return "Today's Deal";
}

function useDealPricing(item: FlashItem) {
  const { priceOf } = useRegion();
  const regular = priceOf(item.product);
  const deal = item.flashPrice != null && item.flashPrice > 0 ? item.flashPrice : regular;
  const off =
    regular > 0 && deal < regular ? Math.round(((regular - deal) / regular) * 100) : item.product.discount ?? 0;
  return { regular, deal, off };
}

/** The flagship deal — large imagery, large price, single clear CTA. */
function HeroDeal({ item }: { item: FlashItem }) {
  const { regular, deal, off } = useDealPricing(item);
  const p = item.product;

  return (
    <Link
      to="/products/$slug"
      params={{ slug: p.slug }}
      aria-label={`${p.name} — flash deal, ${off}% off`}
      className="group relative grid overflow-hidden rounded-[24px] border border-white/[0.08] bg-card/70 backdrop-blur-xl transition-[border-color,box-shadow,transform] duration-200 hover:border-accent/40 hover:shadow-[0_24px_60px_-24px_rgba(255,138,0,0.35)] sm:grid-cols-2"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-muted/40 sm:aspect-auto sm:min-h-[300px]">
        {p.image && (
          <img
            src={p.image}
            alt={p.name}
            loading="lazy"
            decoding="async"
            className="size-full object-cover transition-transform duration-500 motion-safe:group-hover:scale-[1.02]"
          />
        )}
        <span className="absolute left-3 top-3 rounded-full bg-gradient-to-r from-accent to-accent/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-accent-foreground">
          Limited
        </span>
      </div>

      <div className="flex flex-col justify-center gap-4 p-5 sm:p-8">
        <span className="text-[10.5px] font-medium uppercase tracking-[0.18em] text-accent">
          {urgencyLabel(item)}
        </span>
        <h3 className="font-display text-[19px] sm:text-[26px] font-semibold leading-snug tracking-tight text-foreground line-clamp-2">
          {p.name}
        </h3>

        <div className="flex flex-wrap items-baseline gap-3">
          <Price value={deal} className="text-[26px] sm:text-[32px] font-display font-bold text-foreground tabular-nums" />
          {deal < regular && (
            <Price value={regular} variant="compare" className="text-[13px] text-muted-foreground line-through" />
          )}
          {off > 0 && (
            <span className="font-display text-[20px] sm:text-[24px] font-bold text-accent tabular-nums">
              {off}% OFF
            </span>
          )}
        </div>

        <span className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-accent to-accent/80 px-6 text-[12.5px] font-semibold uppercase tracking-[0.14em] text-accent-foreground transition-transform duration-200 motion-safe:group-hover:translate-y-[-1px] sm:w-auto sm:self-start">
          Shop Deal
          <ArrowRight className="size-4" />
        </span>
      </div>
    </Link>
  );
}

/** Secondary deals — image, price, discount, one-line title, tiny badge. */
function DealCard({ item }: { item: FlashItem }) {
  const { regular, deal, off } = useDealPricing(item);
  const p = item.product;

  return (
    <Link
      to="/products/$slug"
      params={{ slug: p.slug }}
      aria-label={`${p.name} — ${off}% off`}
      className="group flex w-[210px] shrink-0 snap-start flex-col overflow-hidden rounded-[18px] border border-white/[0.07] bg-card/60 transition-[border-color,box-shadow] duration-200 hover:border-accent/35"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-muted/40">
        {p.image && (
          <img
            src={p.image}
            alt={p.name}
            loading="lazy"
            decoding="async"
            className="size-full object-cover transition-transform duration-500 motion-safe:group-hover:scale-[1.03]"
          />
        )}
        {off > 0 && (
          <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-1 text-[10px] font-bold text-accent ring-1 ring-accent/30">
            {off}% OFF
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <p className="line-clamp-1 text-[12.5px] font-medium text-foreground">{p.name}</p>
        <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {urgencyLabel(item)}
        </span>
        <div className="mt-auto flex items-baseline gap-2">
          <Price value={deal} className="text-[15px] font-display font-bold text-foreground tabular-nums" />
          {deal < regular && (
            <Price value={regular} variant="compare" className="text-[10.5px] text-muted-foreground line-through" />
          )}
        </div>
      </div>
    </Link>
  );
}

/**
 * Flash Deals Hero (Homepage v2.1) — one flagship deal plus a snapping rail.
 * Composition only: pricing, eligibility and rotation stay in useFlashDeals.
 */
export function FlashDealsBand() {
  const { items, loading } = useFlashDeals();

  const visible = useMemo(() => items.slice(0, 7), [items]);
  const [hero, ...rest] = visible;

  if (loading || !hero) return null;

  return (
    <section
      aria-labelledby="flash-deals-heading"
      className="relative py-10 sm:py-12 max-w-7xl mx-auto scroll-mt-24"
    >
      {/* Restrained ambient glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-8 -top-10 h-48 rounded-full opacity-[0.18] blur-3xl"
        style={{ background: "var(--gradient-ember)" }}
      />

      <div className="relative px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <Flame className="size-4 text-accent" strokeWidth={2} aria-hidden />
          <h2
            id="flash-deals-heading"
            className="font-display text-[24px] sm:text-[32px] font-semibold uppercase tracking-tight text-foreground"
          >
            Flash Deals
          </h2>
        </div>
        <p className="mt-1.5 text-[12.5px] sm:text-[13.5px] text-muted-foreground">
          Limited-time savings, refreshed daily.
        </p>
        <div
          aria-hidden
          className="mt-3 h-px w-16 origin-left rounded-full bg-gradient-to-r from-accent to-transparent motion-safe:animate-fade-in"
          style={{ animationTimingFunction: EASE }}
        />
      </div>

      <LazyMount minHeight={340}>
        <div className="relative mt-6 px-4 sm:px-6">
          <HeroDeal item={hero} />
        </div>

        {rest.length > 0 && (
          <div className="relative mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 sm:px-6 pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {rest.map((item) => (
              <DealCard key={item.dealId ?? item.product.slug} item={item} />
            ))}
          </div>
        )}
      </LazyMount>

      <div className="relative mt-7 flex justify-center px-4 sm:px-6">
        <Link
          to="/deals"
          className="group inline-flex min-h-11 items-center gap-2 rounded-full border border-accent/40 bg-accent/[0.04] px-7 text-[12px] font-mono font-semibold uppercase tracking-[0.18em] text-accent transition-[background-color,border-color] duration-200 hover:bg-accent/10 hover:border-accent/60"
        >
          Explore All Deals
          <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" />
        </Link>
      </div>
    </section>
  );
}
