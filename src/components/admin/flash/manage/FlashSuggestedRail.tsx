/**
 * Suggested deals — a horizontal rail of AI-picked products with a single
 * "Feature now" action and a plain-language reason. Admin decides.
 */
import { Sparkles, Plus } from "lucide-react";
import type { ProductRecommendation } from "@/lib/flash/flash-intelligence";
import type { Product } from "@/lib/products";

export function FlashSuggestedRail({
  recommendations, onFeature,
}: {
  recommendations: ProductRecommendation[];
  onFeature: (p: Product) => void;
}) {
  if (recommendations.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/40 p-6 text-center">
        <p className="text-sm text-muted-foreground">Every strong product is already featured.</p>
      </div>
    );
  }

  return (
    <div className="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1">
      {recommendations.slice(0, 10).map((r) => (
        <article key={r.product.slug}
          className="w-[248px] shrink-0 snap-start overflow-hidden rounded-2xl border border-border bg-card">
          <div className="relative h-28 bg-black/40">
            {r.product.image && (
              <img loading="lazy" decoding="async" src={r.product.image} alt="" className="size-full object-cover" />
            )}
            <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full border border-accent/30 bg-background/80 px-2 py-0.5 text-[10px] font-mono tabular-nums text-accent backdrop-blur">
              <Sparkles className="size-3" /> {Math.round(r.score)}
            </span>
          </div>
          <div className="space-y-2 p-3">
            <p className="line-clamp-2 text-sm font-medium leading-snug">{r.product.name}</p>
            <p className="text-[11px] text-muted-foreground line-clamp-2">{r.reasons[0]}</p>
            <button onClick={() => onFeature(r.product)}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-accent/40 px-3 min-h-11 text-[10px] font-mono uppercase tracking-widest text-accent hover:bg-accent/10 transition">
              <Plus className="size-3" /> Feature now
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
