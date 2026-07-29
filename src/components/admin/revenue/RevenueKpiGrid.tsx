/**
 * Revenue KPI grid + executive summary (Revenue Intelligence Engine v1.0).
 * Presentation only — every figure comes from the shared revenue snapshot.
 */
import { Boxes, Gauge, TrendingUp, Wallet, Zap } from "lucide-react";
import { money, pct, type RevenueSnapshot } from "@/lib/revenue-intelligence/types";
import { cn } from "@/lib/utils";

function Kpi({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: typeof Wallet;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl border border-border/40 bg-card/40 p-4">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
        <Icon className={cn("size-3.5", accent ?? "text-accent")} />
        {label}
      </div>
      <div className="mt-2 text-xl font-semibold tabular-nums">{value}</div>
      {sub ? <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

function DriverRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/20 py-1.5 last:border-0">
      <div className="min-w-0">
        <div className="truncate text-xs">{label}</div>
        {sub ? <div className="text-[10px] text-muted-foreground">{sub}</div> : null}
      </div>
      <span className="shrink-0 text-xs font-medium tabular-nums text-emerald-300">{value}</span>
    </div>
  );
}

export function RevenueKpiGrid({ snapshot }: { snapshot: RevenueSnapshot }) {
  const c = snapshot.kpis.currency;
  const k = snapshot.kpis;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Revenue today" value={money(k.today, c)} sub={`${k.ordersToday} orders`} icon={Wallet} />
        <Kpi label="This week" value={money(k.week, c)} icon={TrendingUp} accent="text-emerald-300" />
        <Kpi label="This month" value={money(k.month, c)} sub={`${k.ordersMonth} orders`} icon={TrendingUp} accent="text-emerald-300" />
        <Kpi label="Average order value" value={money(k.aov, c)} icon={Gauge} />
        <Kpi label="Conversion rate" value={pct(k.conversionRate, 2)} sub="Trailing 30 days" icon={Gauge} accent="text-sky-300" />
        <Kpi label="Flash Deal revenue" value={money(k.flashRevenue, c)} sub="30-day run-rate on promoted products" icon={Zap} accent="text-amber-300" />
        <Kpi
          label="Lost revenue opportunity"
          value={money(k.lostRevenue, c)}
          sub={`${snapshot.opportunities.length} open opportunities`}
          icon={Boxes}
          accent="text-rose-300"
        />
        <Kpi
          label="Marketplace health"
          value={`${snapshot.summary.healthScore}/100`}
          sub={`~${snapshot.summary.growthAvailable}% monthly upside available`}
          icon={Gauge}
          accent="text-violet-300"
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-2xl border border-border/40 bg-card/40 p-4">
          <div className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">Top categories</div>
          {k.topCategories.length === 0 ? (
            <p className="text-xs text-muted-foreground">No category revenue recorded yet.</p>
          ) : (
            k.topCategories.map((r) => (
              <DriverRow key={r.label} label={r.label} value={money(r.revenue, c)} sub={`${r.units} units`} />
            ))
          )}
        </div>
        <div className="rounded-2xl border border-border/40 bg-card/40 p-4">
          <div className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">Top vendors &amp; brands</div>
          {k.topVendors.length === 0 ? (
            <p className="text-xs text-muted-foreground">No vendor revenue recorded yet.</p>
          ) : (
            k.topVendors.map((r) => <DriverRow key={r.label} label={r.label} value={money(r.revenue, c)} />)
          )}
        </div>
        <div className="rounded-2xl border border-border/40 bg-card/40 p-4">
          <div className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">Top selling products</div>
          {k.topProducts.length === 0 ? (
            <p className="text-xs text-muted-foreground">No product revenue recorded yet.</p>
          ) : (
            k.topProducts.map((r) => (
              <DriverRow key={r.slug} label={r.name} value={money(r.revenue, c)} sub={`${r.units} units`} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export function RevenueExecutiveSummaryCard({ snapshot }: { snapshot: RevenueSnapshot }) {
  const c = snapshot.kpis.currency;
  return (
    <div className="rounded-2xl border border-accent/25 bg-accent/[0.04] p-5">
      <div className="text-[11px] uppercase tracking-wide text-accent">Executive summary</div>
      <p className="mt-2 text-sm leading-relaxed">
        Revenue is at <strong className="tabular-nums">{money(snapshot.kpis.month, c)}</strong> this month with an
        average order of <strong className="tabular-nums">{money(snapshot.kpis.aov, c)}</strong>. Marketplace health is{" "}
        <strong>{snapshot.summary.healthScore}/100</strong>. Acting on every open opportunity is worth an estimated{" "}
        <strong className="tabular-nums text-emerald-300">{money(snapshot.kpis.lostRevenue, c)}</strong> over the next
        30 days (~{snapshot.summary.growthAvailable}% growth).
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-emerald-300">Biggest opportunity</div>
          <div className="mt-0.5 text-xs">{snapshot.summary.highestPriority}</div>
        </div>
        <div className="rounded-xl border border-rose-400/20 bg-rose-400/5 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-rose-300">Biggest risk</div>
          <div className="mt-0.5 text-xs">{snapshot.summary.highestRisk}</div>
        </div>
      </div>
      <p className="mt-3 text-[10px] text-muted-foreground">
        Estimates only. The engine recommends — nothing is applied without an admin.
      </p>
    </div>
  );
}
