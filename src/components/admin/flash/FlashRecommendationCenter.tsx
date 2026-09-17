/**
 * AI Recommendation Center — suggested products to feature next, each with an
 * explicit "recommended because" explanation. Preview / Create deal / Dismiss.
 */
import { useState } from "react";
import { Sparkles, Eye, Plus, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { ProductRecommendation } from "@/lib/flash/flash-intelligence";
import { CAMPAIGN_TEMPLATES, type CampaignTemplate } from "@/lib/flash/campaign-templates";
import type { Product } from "@/lib/products";

export function FlashRecommendationCenter({
  recommendations, onCreate,
}: {
  recommendations: ProductRecommendation[];
  onCreate: (product: Product, template: CampaignTemplate | null) => void;
}) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [template, setTemplate] = useState<CampaignTemplate | null>(null);

  const list = recommendations.filter((r) => !dismissed.has(r.product.slug));

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-card p-4" aria-label="Campaign templates">
        <p className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.3em] text-muted-foreground mb-3">
          Campaign templates
        </p>
        <div className="flex flex-wrap gap-1.5">
          {CAMPAIGN_TEMPLATES.map((t) => {
            const active = template?.key === t.key;
            return (
              <button key={t.key} onClick={() => setTemplate(active ? null : t)}
                aria-pressed={active}
                title={`${t.blurb} · ${t.durationHours}h · ${t.discountPct}% · priority ${t.priority}`}
                className={`rounded-full border px-3 min-h-11 text-[10px] font-mono uppercase tracking-widest transition ${
                  active ? t.accent : "border-white/10 text-muted-foreground hover:bg-white/5"
                }`}>
                {t.label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {template
            ? `“${template.label}” will prefill ${template.durationHours}h duration, ${template.discountPct}% discount and priority ${template.priority}. Everything stays editable.`
            : "Pick a template to prefill new deals — nothing is applied until you publish."}
        </p>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4" aria-label="Recommended products">
        <p className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.3em] text-muted-foreground mb-3">
          <Sparkles className="size-3.5 text-accent" /> Recommended to feature · {list.length}
        </p>
        {list.length === 0 ? (
          <p className="text-xs text-muted-foreground">No new recommendations — every strong product is already featured.</p>
        ) : (
          <ul className="grid md:grid-cols-2 gap-2">
            {list.map((r) => (
              <li key={r.product.slug} className="rounded-xl border border-border bg-background/40 p-3">
                <div className="flex items-start gap-3">
                  <div className="size-12 shrink-0 rounded-lg overflow-hidden bg-black/40 ring-1 ring-white/10">
                    {r.product.image && <img loading="lazy" decoding="async" src={r.product.image} alt="" className="size-full object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate">{r.product.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {r.product.category} · {r.product.stockQuantity} in stock
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full border border-accent/30 bg-accent/10 text-accent px-2 py-0.5 text-[10px] font-mono tabular-nums">
                    {Math.round(r.score)}
                  </span>
                </div>

                <p className="mt-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Recommended because</p>
                <ul className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                  {r.reasons.map((why) => <li key={why}>• {why}</li>)}
                </ul>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Link to="/products/$slug" params={{ slug: r.product.slug }} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-full border border-white/10 px-3 min-h-11 text-[10px] font-mono uppercase tracking-widest hover:bg-white/5">
                    <Eye className="size-3" /> Preview
                  </Link>
                  <button onClick={() => onCreate(r.product, template)}
                    className="inline-flex items-center gap-1 rounded-full border border-accent/40 text-accent px-3 min-h-11 text-[10px] font-mono uppercase tracking-widest hover:bg-accent/10">
                    <Plus className="size-3" /> Create deal
                  </button>
                  <button onClick={() => setDismissed((s) => new Set(s).add(r.product.slug))}
                    aria-label={`Dismiss ${r.product.name}`}
                    className="inline-flex items-center gap-1 rounded-full border border-white/10 px-3 min-h-11 text-[10px] font-mono uppercase tracking-widest hover:bg-white/5">
                    <X className="size-3" /> Dismiss
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
