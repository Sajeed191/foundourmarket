import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Zap, ArrowRight, Timer } from "lucide-react";
import { useFlashDeals, type FlashItem } from "@/lib/use-flash-deals";
import { useRegion } from "@/lib/region";
import { Price } from "@/components/site/Price";
import { PremiumSectionHeading } from "@/components/site/PremiumSectionHeading";
import { LazyMount } from "@/components/site/LazyMount";

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function InlineCountdown({ end, now }: { end: string; now: number }) {
  const diff = Math.max(0, new Date(end).getTime() - now);
  const d = Math.floor(diff / 86_400_000);
  const h = Math.floor((diff % 86_400_000) / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1000);
  const label = d > 0 ? `${d}d ${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(h)}:${pad(m)}:${pad(s)}`;
  return <span className="font-mono tabular-nums tracking-wider text-accent">{label}</span>;
}

function DealPill({ item, now }: { item: FlashItem; now: number }) {
  const { priceOf } = useRegion();
  const p = item.product;
  const regular = priceOf(p);
  const flash = item.flashPrice ?? regular;
  const off = flash > 0 && regular > 0 ? Math.round(((regular - flash) / regular) * 100) : 0;

  return (
    <Link
      to="/products/$slug"
      params={{ slug: p.slug }}
      className="group relative flex shrink-0 w-[260px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-card transition-all duration-200 hover:border-accent/40 hover:shadow-[0_12px_32px_-10px_rgba(255,138,0,0.35)]"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-muted/60">
        {p.image && (
          <img
            src={p.image}
            alt={p.name}
            loading="lazy"
            decoding="async"
            className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        )}
        {off > 0 && (
          <span className="absolute left-2.5 top-2.5 rounded-full bg-accent px-2 py-1 text-[10px] font-bold text-accent-foreground">
            −{off}%
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col justify-between gap-2 p-3">
        <p className="text-[12.5px] font-medium leading-snug text-foreground line-clamp-2">{p.name}</p>
        <div className="flex items-center justify-between">
          <Price product={p} price={flash} compareAt={regular} size="sm" />
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Timer className="size-3 text-accent" />
            <InlineCountdown end={item.endsAt} now={now} />
          </span>
        </div>
      </div>
    </Link>
  );
}

export function FlashDealsBand() {
  const { deals, loading } = useFlashDeals();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const active = useMemo(
    () => deals.filter((d) => new Date(d.endsAt).getTime() > now).slice(0, 6),
    [deals, now],
  );

  if (loading || active.length === 0) return null;

  return (
    <section className="py-6 sm:py-8 max-w-7xl mx-auto scroll-mt-24">
      <div className="px-4 sm:px-6">
        <PremiumSectionHeading
          title="Flash Deals"
          eyebrow="Limited Offers"
          subtitle="Today's best prices from trusted sellers."
        />
      </div>
      <LazyMount minHeight={200}>
        <div className="mt-4 flex gap-3 overflow-x-auto px-4 sm:px-6 pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden snap-x snap-mandatory">
          {active.map((item) => (
            <div key={item.dealId} className="snap-start">
              <DealPill item={item} now={now} />
            </div>
          ))}
        </div>
      </LazyMount>
      <div className="px-4 sm:px-6 mt-5 flex justify-center">
        <Link
          to="/deals"
          className="group inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/[0.04] px-6 py-3 text-[12px] font-mono font-semibold uppercase tracking-[0.18em] text-accent transition-[background-color,border-color,box-shadow] duration-200 hover:bg-accent/10 hover:border-accent/60"
        >
          View All Deals
          <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" />
        </Link>
      </div>
    </section>
  );
}
