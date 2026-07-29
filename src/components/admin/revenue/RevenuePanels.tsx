/**
 * Product ranking, forecast, alerts and what-if simulator panels
 * (Revenue Intelligence Engine v1.0). Presentation only.
 */
import { useMemo, useState } from "react";
import { SmartFixLink } from "@/components/admin/SmartFixLink";
import type { Product } from "@/lib/products";
import {
  money,
  pct,
  PLACEMENT_LABEL,
  SEVERITY_LABEL,
  SEVERITY_TONE,
  type ProductRankScore,
  type RevenueAlert,
  type RevenueForecast,
} from "@/lib/revenue-intelligence/types";
import { simulateAll } from "@/lib/revenue-intelligence/simulator";
import { cn } from "@/lib/utils";

export function ProductRankingPanel({ ranking, currency }: { ranking: ProductRankScore[]; currency: string }) {
  const top = ranking.slice(0, 25);
  if (top.length === 0) {
    return <div className="rounded-2xl border border-border/40 bg-card/40 p-6 text-center text-xs text-muted-foreground">No published products to rank yet.</div>;
  }
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted-foreground">
        Live demand score from sales velocity, conversion, views, wishlist, stock cover, reviews and AI confidence.
        Not recorded per product, so excluded: {top[0].unavailable.join(", ")}.
      </p>
      {top.map((r, i) => (
        <div key={r.slug} className="flex items-center gap-3 rounded-xl border border-border/40 bg-card/40 p-3">
          <span className="w-6 shrink-0 text-center text-xs tabular-nums text-muted-foreground">{i + 1}</span>
          {r.image ? <img src={r.image} alt="" loading="lazy" className="size-9 shrink-0 rounded-lg object-cover" /> : null}
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-medium">{r.name}</div>
            <div className="text-[10px] text-muted-foreground">
              {PLACEMENT_LABEL[r.placement]} · {money(r.revenueRunRate, currency)} / 30 days
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-sm font-semibold tabular-nums text-accent">{r.score}</div>
            <div className="text-[10px] text-muted-foreground">/100</div>
          </div>
          <SmartFixLink
            issue={{ entity: "product", entityId: r.slug, module: "revenue-intelligence", action: "Review product" }}
            origin="revenue-intelligence"
            variant="ghost"
            className="shrink-0 text-[11px]"
          >
            Open
          </SmartFixLink>
        </div>
      ))}
    </div>
  );
}

export function RevenueForecastPanel({ forecast, currency }: { forecast: RevenueForecast; currency: string }) {
  const rows = [
    { label: "Today (projected)", value: forecast.today },
    { label: "Next 7 days", value: forecast.week },
    { label: "This month", value: forecast.month },
    { label: "Flash Deals", value: forecast.flash },
  ];
  return (
    <div className="rounded-2xl border border-border/40 bg-card/40 p-4">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Revenue forecast</div>
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {rows.map((r) => (
          <div key={r.label} className="rounded-xl border border-border/30 bg-background/30 p-3">
            <div className="text-[10px] text-muted-foreground">{r.label}</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">{money(r.value, currency)}</div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        {forecast.seasonalNote} Day-of-week index {forecast.seasonalIndex.toFixed(2)}.
      </p>
      <p className="mt-1 text-[10px] text-muted-foreground">Estimate only. {forecast.basis}</p>
    </div>
  );
}

export function RevenueAlertsPanel({ alerts }: { alerts: RevenueAlert[] }) {
  if (alerts.length === 0) {
    return <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-6 text-center text-xs text-emerald-300">No revenue risks detected.</div>;
  }
  return (
    <div className="space-y-2">
      {alerts.map((a) => (
        <div key={a.id} className="flex items-start gap-3 rounded-xl border border-border/40 bg-card/40 p-3">
          <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium", SEVERITY_TONE[a.severity])}>
            {SEVERITY_LABEL[a.severity]}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium">{a.title}</div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{a.detail}</p>
            {a.subject ? <div className="mt-0.5 text-[10px] text-muted-foreground">{a.subject}</div> : null}
          </div>
          <SmartFixLink issue={a.issue} origin="revenue-intelligence" variant="ghost" className="shrink-0 text-[11px]">
            Review
          </SmartFixLink>
        </div>
      ))}
    </div>
  );
}

export function RevenueSimulatorPanel({ products, currency }: { products: Product[]; currency: string }) {
  const options = useMemo(
    () => products.filter((p) => p.status === "published").slice(0, 300).sort((a, b) => b.soldCount - a.soldCount),
    [products],
  );
  const [slug, setSlug] = useState<string>(options[0]?.slug ?? "");
  const product = options.find((p) => p.slug === slug) ?? options[0] ?? null;
  const results = useMemo(() => (product ? simulateAll(product) : []), [product]);

  if (!product) {
    return <div className="rounded-2xl border border-border/40 bg-card/40 p-6 text-center text-xs text-muted-foreground">No published products to simulate.</div>;
  }

  return (
    <div className="rounded-2xl border border-border/40 bg-card/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">What-if simulator</div>
        <select
          value={product.slug}
          onChange={(e) => setSlug(e.target.value)}
          aria-label="Choose a product to simulate"
          className="max-w-[260px] rounded-lg border border-border/40 bg-background/60 px-2.5 py-1.5 text-xs"
        >
          {options.map((p) => (
            <option key={p.slug} value={p.slug}>{p.name}</option>
          ))}
        </select>
      </div>

      <div className="mt-3 space-y-2">
        {results.map((r) => (
          <div key={r.scenario} className="rounded-xl border border-border/30 bg-background/30 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium">{r.label}</span>
              <span className="text-xs tabular-nums text-emerald-300">+{money(r.revenueDelta, currency)}</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              <span className="tabular-nums">+{r.ordersDelta} orders</span>
              <span className="tabular-nums">Conversion +{pct(r.conversionDelta, 2)}</span>
              <span className={cn("tabular-nums", r.profitDelta >= 0 ? "text-emerald-300" : "text-rose-300")}>
                {r.profitDelta >= 0 ? "+" : ""}{money(r.profitDelta, currency)} profit
              </span>
              <span>Confidence {r.confidence}%</span>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">{r.assumption}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[10px] text-muted-foreground">
        Simulations are estimates and change nothing — apply decisions in the existing tools.
      </p>
    </div>
  );
}
