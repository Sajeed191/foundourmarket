import { AreaChart, Area, BarChart, Bar, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import {
  ArrowUpRight, CalendarRange, Coins, Landmark, Layers, PieChart, Receipt, ShieldAlert,
  Sparkles, TrendingDown, TrendingUp, Users, XCircle, History, Download,
} from "lucide-react";
import { useState } from "react";
import type { FinancialIntelligence } from "@/lib/payments-intel-v4.functions";
import { BarList, EmptyState, Panel, StatKpi, Trend, money, compact, when, downloadCsv, downloadExcel } from "./ui";

const axis = { stroke: "hsl(var(--muted-foreground))", fontSize: 10 } as const;
const tooltipStyle = {
  background: "hsl(var(--background))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 12,
  fontSize: 11,
};

function Line({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-white/5 last:border-0">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className={`text-[11px] font-mono tabular-nums ${tone ?? ""}`}>{value}</span>
    </div>
  );
}

/** Section 1 — executive summary. */
function ExecutiveSummaryPanel({ data }: { data: FinancialIntelligence }) {
  const e = data.executive;
  const c = e.currency;
  return (
    <Panel title="Executive summary" hint={`Live marketplace finance · last ${data.window_days} days`}>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2.5">
        <StatKpi label="Today's revenue" icon={<TrendingUp className="size-3.5" />} value={money(e.today_revenue, c)} delta={e.vs_yesterday} sub="vs yesterday" />
        <StatKpi label="Yesterday" value={money(e.yesterday_revenue, c)} />
        <StatKpi label="7-day revenue" icon={<CalendarRange className="size-3.5" />} value={money(e.revenue_7d, c)} delta={e.trend_7d} sub="vs prior 7d" />
        <StatKpi label="30-day revenue" icon={<CalendarRange className="size-3.5" />} value={money(e.revenue_30d, c)} delta={e.trend_30d} sub="vs prior 30d" />
        <StatKpi label="Month to date" value={money(e.mtd_revenue, c)} />
        <StatKpi label="Year to date" value={money(e.ytd_revenue, c)} />
        <StatKpi label="Gross revenue" icon={<Coins className="size-3.5" />} value={money(e.gross_revenue, c)} />
        <StatKpi label="Total refunds" tone="text-violet-300" value={money(e.total_refunds, c)} />
        <StatKpi label="Net revenue" icon={<Receipt className="size-3.5" />} tone="text-emerald-400" value={money(e.net_revenue, c)} />
        <StatKpi label="Outstanding settlements" icon={<Landmark className="size-3.5" />} value={e.outstanding_settlements == null ? "No data" : money(e.outstanding_settlements, c)} sub="no settlement feed" />
        <StatKpi label="Average order value" value={money(e.aov, c)} />
        <StatKpi label="Payment success rate" tone="text-sky-400" value={e.success_rate == null ? "No data" : `${e.success_rate.toFixed(1)}%`} />
      </div>
    </Panel>
  );
}

/** Section 2 — revenue composition. */
function RevenueBreakdownPanel({ data }: { data: FinancialIntelligence }) {
  const b = data.breakdown;
  const c = data.executive.currency;
  if (!b.available) {
    return (
      <Panel title="Revenue breakdown" hint="Products · shipping · tax · discounts">
        <EmptyState title="No paid orders in this window." hint="The revenue composition appears as soon as an order is paid." />
      </Panel>
    );
  }
  return (
    <Panel title="Revenue breakdown" hint="Composition of collected revenue">
      <div className="grid md:grid-cols-2 gap-x-6">
        <div>
          <Line label="Products" value={money(b.products, c)} />
          <Line label="Shipping" value={money(b.shipping, c)} />
          <Line label="Taxes" value={money(b.taxes, c)} />
          <Line label="Discounts" value={`− ${money(b.discounts, c)}`} tone="text-amber-400" />
          <Line label="Coupons" value={`− ${money(b.coupons, c)}`} tone="text-amber-400" />
        </div>
        <div>
          <Line label="Marketplace commission" value={b.commission == null ? "No data" : money(b.commission, c)} />
          <Line label="Vendor earnings" value={b.vendor_earnings == null ? "No data" : money(b.vendor_earnings, c)} />
          <Line label="Platform earnings" value={b.platform_earnings == null ? "No data" : money(b.platform_earnings, c)} />
          <Line label="Refunds" value={`− ${money(b.refunds, c)}`} tone="text-violet-300" />
          <Line label="Net revenue" value={money(b.net, c)} tone="text-emerald-400 font-semibold" />
        </div>
      </div>
      <BarList
        items={[
          { k: "products", v: b.products },
          { k: "shipping", v: b.shipping },
          { k: "taxes", v: b.taxes },
        ]}
        currency={c}
      />
    </Panel>
  );
}

/** Section 3 — rankings. */
function RankingsPanel({ data }: { data: FinancialIntelligence }) {
  const r = data.rankings;
  const c = data.executive.currency;
  const blocks = [
    { title: "Top categories", items: r.categories, empty: "No category revenue recorded." },
    { title: "Top brands", items: r.brands, empty: "No brand revenue recorded." },
    { title: "Top vendors", items: r.vendors, empty: "Vendor revenue not enabled." },
    { title: "Highest revenue products", items: r.products, empty: "No product revenue recorded." },
  ].filter((b) => b.items.length > 0);

  if (!blocks.length) return null;

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      {blocks.map((b) => (
        <Panel key={b.title} title={b.title} hint="By collected revenue">
          <BarList items={b.items} currency={c} empty={b.empty} />
        </Panel>
      ))}
      {r.weakest_categories.length > 0 && (
        <Panel title="Lowest performing categories" hint="Least revenue in this window">
          <BarList items={r.weakest_categories} currency={c} />
        </Panel>
      )}
    </div>
  );
}

/** Section 4 — payment failure center. */
function FailureCenterPanel({ data }: { data: FinancialIntelligence }) {
  const f = data.failures;
  const c = data.executive.currency;
  if (!f.available) {
    return (
      <Panel title="Payment failure center" hint="Declines · gateway errors · cancellations">
        <EmptyState title="No failed payments recorded." hint="Failure reasons and retry recovery appear here only when attempts actually fail." />
      </Panel>
    );
  }
  return (
    <Panel title="Payment failure center" hint="Declines · gateway errors · cancellations">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-3">
        <StatKpi label="Failed payments" icon={<XCircle className="size-3.5" />} tone="text-destructive" value={f.failed_count} sub={money(f.failed_value, c)} />
        <StatKpi label="Retry success" value={f.retry_success_rate == null ? "No data" : `${f.retry_success_rate.toFixed(1)}%`} sub="failed then paid" />
        <StatKpi label="Most common" value={<span className="text-sm truncate block">{f.most_common ?? "No data"}</span>} />
        <StatKpi label="User cancellations" value={f.user_cancelled} />
      </div>
      <div className="grid md:grid-cols-2 gap-x-6 mb-3">
        <div>
          <Line label="Gateway errors" value={String(f.gateway_errors)} />
          <Line label="Bank / issuer errors" value={String(f.bank_errors)} />
        </div>
        <div>
          <Line label="Timeouts" value={String(f.timeouts)} />
          <Line label="Unknown failures" value={String(f.unknown)} />
        </div>
      </div>
      <BarList items={f.reasons} currency={c} empty="No failure reasons stored by the gateway." />
    </Panel>
  );
}

/** Section 5 — refund center. */
function RefundCenterPanel({ data }: { data: FinancialIntelligence }) {
  const r = data.refunds;
  const c = data.executive.currency;
  if (!r.available) {
    return (
      <Panel title="Refund center" hint="Queue · turnaround · reasons">
        <EmptyState title="No refunds recorded yet." />
      </Panel>
    );
  }
  return (
    <Panel title="Refund center" hint="Queue · turnaround · reasons · trend">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-3">
        <StatKpi label="Pending refunds" tone="text-amber-400" value={r.pending_count} sub={money(r.pending_value, c)} />
        <StatKpi label="Completed refunds" tone="text-emerald-400" value={r.completed_count} sub={money(r.completed_value, c)} />
        <StatKpi label="Average refund time" value={r.avg_hours == null ? "No data" : `${r.avg_hours.toFixed(1)}h`} />
        <StatKpi label="Refund rate" value={r.refund_rate == null ? "No data" : `${r.refund_rate.toFixed(1)}%`} sub="of gross revenue" />
      </div>
      {r.trend.length > 1 && (
        <div className="h-40 -ml-2 mb-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={r.trend} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="2 6" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="date" tick={axis} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis tick={axis} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => compact(v)} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => money(v, c)} />
              <Bar dataKey="value" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <BarList items={r.reasons} currency={c} empty="No refund reasons recorded." />
    </Panel>
  );
}

/** Section 6 — settlement intelligence (no source yet). */
function SettlementPanel({ data }: { data: FinancialIntelligence }) {
  return (
    <Panel title="Settlement intelligence" hint="Upcoming · completed · delayed · gateway-wise">
      <EmptyState title="No settlement data available yet." hint={data.settlements.reason} />
    </Panel>
  );
}

/** Section 7 — marketplace commission. */
function CommissionPanel({ data }: { data: FinancialIntelligence }) {
  const m = data.commission;
  const c = data.executive.currency;
  if (!m.available) {
    return (
      <Panel title="Marketplace commission" hint="Commission · vendor · platform earnings">
        <EmptyState title="Marketplace commission not enabled." hint="Commission analytics appear once vendor commission records exist." />
      </Panel>
    );
  }
  return (
    <Panel title="Marketplace commission" hint="Commission · vendor · platform earnings">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-3">
        <StatKpi label="Commission collected" value={money(m.collected, c)} />
        <StatKpi label="Vendor earnings" value={money(m.vendor_earnings, c)} />
        <StatKpi label="Platform earnings" value={money(m.platform_earnings, c)} />
        <StatKpi label="Average commission" value={m.rate == null ? "No data" : `${m.rate.toFixed(1)}%`} />
      </div>
      {m.trend.length > 1 && (
        <div className="h-40 -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={m.trend} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="v4comm" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 6" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="date" tick={axis} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis tick={axis} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => compact(v)} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => money(v, c)} />
              <Area type="monotone" dataKey="value" stroke="hsl(var(--accent))" fill="url(#v4comm)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  );
}

/** Section 8 — customer payment insights. */
function CustomerInsightsPanel({ data }: { data: FinancialIntelligence }) {
  const cu = data.customers;
  const c = data.executive.currency;
  if (!cu.available) return null;
  return (
    <Panel title="Customer payment insights" hint="Spend · loyalty mix">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-3">
        <StatKpi label="Average customer spend" icon={<Users className="size-3.5" />} value={cu.avg_spend == null ? "No data" : money(cu.avg_spend, c)} />
        <StatKpi label="Repeat customer revenue" value={money(cu.repeat_revenue, c)} />
        <StatKpi label="First-time revenue" value={money(cu.first_time_revenue, c)} />
        <StatKpi label="Repeat share" value={cu.repeat_share == null ? "No data" : `${cu.repeat_share.toFixed(1)}%`} />
      </div>
      <ul className="space-y-2">
        {cu.top.map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-3 text-[11px]">
            <span className="truncate">{t.label}</span>
            <span className="font-mono shrink-0">{money(t.v, c)} · {t.n} order(s)</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** Section 11 — risk monitor. */
function RiskMonitor({ data }: { data: FinancialIntelligence }) {
  if (!data.risks.length) return null;
  return (
    <Panel title="Risk monitor" hint="Only raised when live data supports it">
      <ul className="grid sm:grid-cols-2 gap-2">
        {data.risks.map((r) => (
          <li
            key={r.id}
            className={`rounded-xl border p-3 ${r.severity === "bad" ? "border-destructive/30 bg-destructive/10" : "border-amber-500/30 bg-amber-500/10"}`}
          >
            <p className="flex items-center gap-1.5 text-[12px] font-semibold">
              <ShieldAlert className={`size-3.5 ${r.severity === "bad" ? "text-destructive" : "text-amber-400"}`} />
              {r.title}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{r.detail}</p>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** Section 12 — one recommendation at a time. */
function SmartRecommendation({ data, onAction }: { data: FinancialIntelligence; onAction?: (a: string) => void }) {
  const [idx, setIdx] = useState(0);
  if (!data.recommendations.length) return null;
  const r = data.recommendations[Math.min(idx, data.recommendations.length - 1)];
  return (
    <section className="glass border border-accent/25 rounded-2xl p-4">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent/15 text-accent"><Sparkles className="size-4" /></span>
        <div className="min-w-0">
          <p className="text-[9px] font-mono uppercase tracking-[0.25em] text-muted-foreground">Recommended next step</p>
          <p className="text-sm font-semibold mt-0.5">{r.title}</p>
          <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{r.detail}</p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <button
              onClick={() => onAction?.(r.action)}
              className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 text-accent px-3 py-1.5 text-[11px] min-h-9"
            >
              {r.action_label} <ArrowUpRight className="size-3" />
            </button>
            {data.recommendations.length > 1 && (
              <button
                onClick={() => setIdx((i) => (i + 1) % data.recommendations.length)}
                className="rounded-full border border-white/10 px-3 py-1.5 text-[11px] text-muted-foreground min-h-9 hover:bg-white/5"
              >
                Next ({idx + 1}/{data.recommendations.length})
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Section 13 — advanced exports built from already-loaded aggregates. */
function ExportsPanel({ data }: { data: FinancialIntelligence }) {
  const c = data.executive.currency;
  const sets: { key: string; label: string; headers: string[]; rows: (string | number)[][] }[] = [
    {
      key: "revenue", label: "Revenue",
      headers: ["Date", "Revenue", "Orders", "Refunds"],
      rows: data.daily.map((d) => [d.date, d.revenue, d.orders, d.refunds]),
    },
    {
      key: "breakdown", label: "Revenue breakdown",
      headers: ["Line", "Amount"],
      rows: [
        ["Products", data.breakdown.products], ["Shipping", data.breakdown.shipping],
        ["Taxes", data.breakdown.taxes], ["Discounts", data.breakdown.discounts],
        ["Coupons", data.breakdown.coupons], ["Refunds", data.breakdown.refunds],
        ["Net revenue", data.breakdown.net],
      ],
    },
    {
      key: "refunds", label: "Refund reasons",
      headers: ["Reason", "Value", "Count"],
      rows: data.refunds.reasons.map((r) => [r.k, r.v, r.n]),
    },
    {
      key: "failures", label: "Failure reasons",
      headers: ["Reason", "Value", "Count"],
      rows: data.failures.reasons.map((r) => [r.k, r.v, r.n]),
    },
    {
      key: "vendors", label: "Vendor commission",
      headers: ["Vendor", "Commission", "Records"],
      rows: data.rankings.vendors.map((v) => [v.k, v.v, v.n]),
    },
    {
      key: "customers", label: "Customer spend",
      headers: ["Customer", "Spend", "Orders"],
      rows: data.customers.top.map((t) => [t.label, t.v, t.n]),
    },
  ].filter((s) => s.rows.length > 0);

  return (
    <Panel title="Advanced exports" hint={`Currency: ${c} · built from the loaded window`}>
      {sets.length ? (
        <ul className="grid sm:grid-cols-2 gap-2">
          {sets.map((s) => (
            <li key={s.key} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2">
              <span className="text-[11px] truncate">{s.label}</span>
              <span className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => downloadCsv(`fom-${s.key}`, s.headers, s.rows)} className="rounded-lg border border-white/10 p-1.5 hover:bg-white/5" title="CSV">
                  <Download className="size-3.5" />
                </button>
                <button onClick={() => downloadExcel(`fom-${s.key}`, s.headers, s.rows)} className="rounded-lg border border-white/10 p-1.5 hover:bg-white/5" title="Excel">
                  <Layers className="size-3.5" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="Nothing to export yet." hint="Exports become available once the marketplace records financial activity." />
      )}
      <p className="mt-2 text-[10px] text-muted-foreground">
        Settlement and gateway-performance exports appear once those feeds are connected. Transaction-level exports live in the Payments tab.
      </p>
    </Panel>
  );
}

/** Section 14 — audit trail from existing logs only. */
function AuditTrailPanel({ data }: { data: FinancialIntelligence }) {
  return (
    <Panel title="Audit trail" hint="Finance-related admin & security events">
      {data.audit.length ? (
        <ul className="divide-y divide-white/5">
          {data.audit.map((a) => (
            <li key={a.id} className="py-2 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] truncate">{a.action}</p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {a.entity ?? a.source} {a.actor ? `· actor ${a.actor}…` : ""}
                </p>
              </div>
              <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">{when(a.at)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No finance audit events recorded yet." />
      )}
    </Panel>
  );
}

/** Financial Intelligence tab — v4.0. */
export function FinancialIntelligencePanel({
  data, onAction,
}: { data: FinancialIntelligence; onAction?: (a: string) => void }) {
  if (!data.has_any_data) {
    return (
      <Panel title="Financial intelligence">
        <EmptyState
          title="No financial data available yet."
          hint="Executive summary, revenue breakdown, failures, refunds and commission analytics all populate automatically from real orders and payments."
        />
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <SmartRecommendation data={data} onAction={onAction} />
      <ExecutiveSummaryPanel data={data} />
      <RiskMonitor data={data} />

      <div className="grid lg:grid-cols-2 gap-4">
        <RevenueBreakdownPanel data={data} />
        <Panel title="Net vs gross" hint={`Daily, last ${data.window_days} days`}>
          {data.daily.length ? (
            <div className="h-48 -ml-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.daily} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="v4net" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 6" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="date" tick={axis} tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis tick={axis} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => compact(v)} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => money(v, data.executive.currency)} />
                  <Area type="monotone" dataKey="revenue" stroke="hsl(var(--accent))" fill="url(#v4net)" strokeWidth={2} />
                  <Area type="monotone" dataKey="refunds" stroke="hsl(var(--destructive))" fill="transparent" strokeWidth={1.5} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="No daily revenue recorded in this window." />
          )}
        </Panel>
      </div>

      <RankingsPanel data={data} />

      <div className="grid lg:grid-cols-2 gap-4">
        <FailureCenterPanel data={data} />
        <RefundCenterPanel data={data} />
        <CommissionPanel data={data} />
        <SettlementPanel data={data} />
      </div>

      <CustomerInsightsPanel data={data} />

      <div className="grid lg:grid-cols-2 gap-4">
        <ExportsPanel data={data} />
        <AuditTrailPanel data={data} />
      </div>

      <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <PieChart className="size-3 text-accent" />
        Every figure is computed from recorded orders, payments, refunds and commission rows. Metrics without a source are shown as “No data”.
      </p>
    </div>
  );
}

export { TrendingDown, History, Trend };
