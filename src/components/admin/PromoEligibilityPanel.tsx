import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, EyeOff } from "lucide-react";
import { useProducts } from "@/lib/use-products";
import { useBadgeCatalog } from "@/lib/use-product-badges";
import {
  evaluatePromoEligibility,
  EXCLUSION_LABEL,
  type ExclusionReason,
  type PromoSectionKey,
} from "@/lib/promo-eligibility";

const SECTIONS: { key: PromoSectionKey; label: string; badge: string }[] = [
  { key: "flash_deals", label: "Flash Deals", badge: "flash_deal / hot_deal" },
  { key: "trending", label: "Trending", badge: "trending" },
  { key: "best_sellers", label: "Best Sellers", badge: "bestseller" },
  { key: "new_arrivals", label: "New Arrivals", badge: "new_arrival" },
  { key: "featured", label: "Featured", badge: "featured" },
];

const REASON_ORDER: ExclusionReason[] = [
  "missing_badge",
  "badge_expired",
  "badge_scheduled",
  "badge_inactive",
  "unpublished",
  "out_of_stock",
  "promo_conflict",
];

/**
 * Admin Validation — explains, per promotional section, exactly which products
 * are eligible and why every other product is excluded. Read-only.
 */
export function PromoEligibilityPanel({ only }: { only?: PromoSectionKey[] }) {
  const { products } = useProducts();
  const { map } = useBadgeCatalog();
  const [open, setOpen] = useState<PromoSectionKey | null>(null);

  const rows = useMemo(
    () =>
      SECTIONS.filter((s) => !only || only.includes(s.key)).map((s) => ({
        ...s,
        result: evaluatePromoEligibility(products, map, s.key),
      })),
    [products, map, only],
  );

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <header className="mb-3 flex items-center gap-2">
        <CheckCircle2 className="size-4 text-accent" />
        <h2 className="text-sm font-semibold">Promotional eligibility</h2>
        <span className="text-[11px] text-muted-foreground">Badge-driven — nothing renders without its badge</span>
      </header>

      <div className="space-y-2">
        {rows.map(({ key, label, badge, result }) => {
          const hidden = result.excluded.length;
          const isOpen = open === key;
          return (
            <div key={key} className="rounded-xl border border-white/10 bg-black/20">
              <button
                onClick={() => setOpen(isOpen ? null : key)}
                className="flex w-full items-center gap-3 p-3 text-left"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium">{label}</p>
                  <p className="text-[10px] text-muted-foreground">Requires badge: {badge}</p>
                </div>
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                  {result.eligible.length} eligible
                </span>
                <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-muted-foreground">
                  {hidden} hidden
                </span>
                <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>

              {isOpen && (
                <div className="border-t border-white/10 p-3">
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {REASON_ORDER.filter((r) => result.counts[r] > 0).map((r) => (
                      <span key={r} className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-muted-foreground">
                        ❌ {EXCLUSION_LABEL[r]} · {result.counts[r]}
                      </span>
                    ))}
                    {hidden === 0 && (
                      <span className="text-[10px] text-muted-foreground">Every product qualifies.</span>
                    )}
                  </div>

                  <ul className="max-h-64 space-y-1 overflow-y-auto">
                    {result.excluded
                      .filter((e) => e.reason !== "missing_badge")
                      .slice(0, 100)
                      .map((e) => (
                        <li key={e.product.slug} className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-2 py-1.5">
                          {e.reason === "out_of_stock" || e.reason === "unpublished" ? (
                            <EyeOff className="size-3 shrink-0 text-muted-foreground" />
                          ) : (
                            <AlertTriangle className="size-3 shrink-0 text-amber-400" />
                          )}
                          <span className="min-w-0 flex-1 truncate text-[11px]">{e.product.name}</span>
                          <span className="shrink-0 text-[10px] text-muted-foreground">{EXCLUSION_LABEL[e.reason]}</span>
                        </li>
                      ))}
                    {result.counts.missing_badge > 0 && (
                      <li className="px-2 py-1.5 text-[10px] text-muted-foreground">
                        + {result.counts.missing_badge} products without the {badge} badge (never shown here).
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
