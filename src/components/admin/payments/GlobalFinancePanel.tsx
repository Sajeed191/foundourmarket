import { useMemo, useState } from "react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer,
  Tooltip, XAxis, YAxis, CartesianGrid, Legend,
} from "recharts";
import {
  Globe2, Search, ArrowUpDown, Banknote, Coins, Landmark, ShieldCheck, Store, Sparkles,
} from "lucide-react";
import type {
  GlobalFinance, ScopeKpis, CountryRow, GatewayRow, Scope,
} from "@/lib/payments-global-v6.functions";
import { EmptyState, Panel, StatKpi, Trend, money, compact } from "./ui";

const axis = { stroke: "hsl(var(--muted-foreground))", fontSize: 10 } as const;
const tooltipStyle = {
  background: "hsl(var(--background))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 12,
  fontSize: 11,
};
const PIE = ["hsl(var(--accent))", "hsl(var(--primary))", "#34d399", "#f59e0b", "#a78bfa", "#38bdf8"];

const SCOPE_LABEL: Record<Scope, string> = {
  india: "🇮🇳 India",
  international: "🌍 International",
  global: "🌐 Global",
};

const rate = (v: number | null | undefined, suffix = "%") =>
  v == null ? "No data" : `${v.toFixed(1)}${suffix}`;

/** One revenue card: native currency amounts + reporting currency total. */
function RevenueCard({ k, reporting }: { k: ScopeKpis; reporting: string }) {
  if (!k.has_data) {
    return (
      <Panel title={SCOPE_LABEL[k.scope]}>
        <EmptyState
          title={k.scope === "international" ? "No international transactions yet." : "No transactions yet."}
          hint={
            k.scope === "international"
              ? "Once international orders begin, this dashboard will automatically populate."
              : "Revenue, orders and refunds appear here as soon as payments are captured."
          }
        />
      </Panel>
    );
  }
  return (
    <Panel title={SCOPE_LABEL[k.scope]} hint={`${k.orders} captured payment(s)`}>
      <p className="text-2xl font-semibold tabular-nums">
        {money(k.native[0]?.amount ?? k.revenue, k.primary_currency)}
      </p>
      {k.native.length > 1 && (
        <p className="mt-1 text-[10px] text-muted-foreground truncate">
          {k.native.slice(1, 4).map((n) => `${money(n.amount, n.currency)}`).join(" · ")}
        </p>
      )}
      <p className="mt-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        {money(k.revenue, reporting)} in reporting currency
      </p>
      <div className="mt-2.5 flex items-center gap-2 flex-wrap">
        <Trend delta={k.today_growth} />
        <span className="text-[10px] text-muted-foreground">today vs yesterday</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl border border-white/10 p-2">
          <p className="text-[9px] uppercase tracking-widest text-muted-foreground">Orders</p>
          <p className="text-xs font-semibold tabular-nums">{k.orders}</p>
        </div>
        <div className="rounded-xl border border-white/10 p-2">
          <p className="text-[9px] uppercase tracking-widest text-muted-foreground">Refund %</p>
          <p className="text-xs font-semibold tabular-nums">{rate(k.refund_rate)}</p>
        </div>
        <div className="rounded-xl border border-white/10 p-2">
          <p className="text-[9px] uppercase tracking-widest text-muted-foreground">AOV</p>
          <p className="text-xs font-semibold tabular-nums">{money(k.aov, reporting)}</p>
        </div>
      </div>
    </Panel>
  );
}

function ScopeKpiGrid({ k, reporting }: { k: ScopeKpis; reporting: string }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
      <StatKpi label="Revenue" icon={<Banknote className="size-3.5" />} value={money(k.revenue, reporting)} delta={k.growth.revenue} />
      <StatKpi label="Orders" value={k.orders} delta={k.growth.orders} />
      <StatKpi label="Refunds" tone="text-violet-300" value={money(k.refund_value, reporting)} sub={`${k.refund_count} refund(s)`} delta={k.growth.refunds} />
      <StatKpi label="Success rate" tone="text-emerald-400" value={rate(k.success_rate)} />
      <StatKpi label="Average order value" value={money(k.aov, reporting)} delta={k.growth.aov} />
      <StatKpi label="Avg payment time" value={k.avg_payment_hours == null ? "No data" : `${k.avg_payment_hours.toFixed(1)}h`} />
      <StatKpi label="Cancelled orders" tone="text-muted-foreground" value={k.cancelled_orders} />
      <StatKpi label="Pending payments" tone="text-amber-400" value={money(k.pending_amount, reporting)} sub={`${k.pending_count} payment(s)`} />
      <StatKpi label="Settlement amount" value={k.settlement_amount == null ? "No data" : money(k.settlement_amount, reporting)} sub="no settlement feed" />
      <StatKpi label="Net revenue" value={money(k.net_revenue, reporting)} sub="revenue − refunds" />
      <StatKpi label="Platform earnings" value={k.platform_earnings == null ? "No data" : money(k.platform_earnings, reporting)} sub="recorded commission" />
      <StatKpi label="Vendor earnings" value={k.vendor_earnings == null ? "No data" : money(k.vendor_earnings, reporting)} sub="net of commission" />
    </div>
  );
}

type CountrySort = "revenue" | "orders" | "growth" | "aov";

function CountryTable({ rows, reporting }: { rows: CountryRow[]; reporting: string }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<CountrySort>("revenue");

  const view = useMemo(() => {
    const term = q.trim().toLowerCase();
    const filtered = term ? rows.filter((r) => r.country.toLowerCase().includes(term) || r.code.toLowerCase().includes(term)) : rows;
    return [...filtered].sort((a, b) => {
      if (sort === "orders") return b.orders - a.orders;
      if (sort === "growth") return (b.growth ?? -Infinity) - (a.growth ?? -Infinity);
      if (sort === "aov") return b.aov - a.aov;
      return b.revenue - a.revenue;
    });
  }, [rows, q, sort]);

  if (!rows.length) {
    return (
      <Panel title="Country performance">
        <EmptyState title="No country data available yet." hint="Country analytics populate from shipping addresses on paid orders." />
      </Panel>
    );
  }

  return (
    <Panel
      title="Country performance"
      hint="Sortable · searchable · real orders only"
      actions={
        <div className="flex items-center gap-1.5">
          <label className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search country"
              className="bg-white/[0.03] border border-white/10 rounded-xl pl-7 pr-2 py-1.5 text-[11px] w-28 sm:w-40 focus:outline-none focus:border-accent/40"
            />
          </label>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as CountrySort)}
            className="bg-white/[0.03] border border-white/10 rounded-xl px-2 py-1.5 text-[11px] focus:outline-none focus:border-accent/40"
          >
            <option value="revenue" className="bg-background">Revenue</option>
            <option value="orders" className="bg-background">Orders</option>
            <option value="growth" className="bg-background">Growth</option>
            <option value="aov" className="bg-background">AOV</option>
          </select>
        </div>
      }
    >
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full min-w-[620px] text-[11px]">
          <thead className="text-[9px] uppercase tracking-widest text-muted-foreground">
            <tr className="border-b border-white/10 text-left">
              <th className="py-2 pr-3">Country</th>
              <th className="py-2 pr-3">Revenue</th>
              <th className="py-2 pr-3">Orders</th>
              <th className="py-2 pr-3">Growth</th>
              <th className="py-2 pr-3">Refund %</th>
              <th className="py-2 pr-3">AOV</th>
              <th className="py-2 pr-3">Success</th>
              <th className="py-2">Top method</th>
            </tr>
          </thead>
          <tbody>
            {view.map((r) => (
              <tr key={r.code} className="border-b border-white/5">
                <td className="py-2 pr-3 truncate max-w-[140px]">
                  {r.country} <span className="text-muted-foreground">{r.scope === "india" ? "🇮🇳" : "🌍"}</span>
                </td>
                <td className="py-2 pr-3 font-mono tabular-nums">{money(r.revenue, reporting)}</td>
                <td className="py-2 pr-3 tabular-nums">{r.orders}</td>
                <td className="py-2 pr-3"><Trend delta={r.growth} /></td>
                <td className="py-2 pr-3 tabular-nums">{rate(r.refund_rate)}</td>
                <td className="py-2 pr-3 font-mono tabular-nums">{money(r.aov, reporting)}</td>
                <td className="py-2 pr-3 tabular-nums">{rate(r.success_rate)}</td>
                <td className="py-2 capitalize truncate max-w-[120px]">{r.top_method ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!view.length && <EmptyState title="No countries match this search." />}
    </Panel>
  );
}

function GatewayTable({ title, rows, reporting, empty }: { title: string; rows: GatewayRow[]; reporting: string; empty: string }) {
  if (!rows.length) return <Panel title={title}><EmptyState title={empty} /></Panel>;
  return (
    <Panel title={title} hint="Revenue · success · failures · processing time">
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full min-w-[520px] text-[11px]">
          <thead className="text-[9px] uppercase tracking-widest text-muted-foreground">
            <tr className="border-b border-white/10 text-left">
              <th className="py-2 pr-3">Route</th>
              <th className="py-2 pr-3">Revenue</th>
              <th className="py-2 pr-3">Orders</th>
              <th className="py-2 pr-3">Success</th>
              <th className="py-2 pr-3">Failure</th>
              <th className="py-2 pr-3">Refund %</th>
              <th className="py-2 pr-3">Avg time</th>
              <th className="py-2">Growth</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((g) => (
              <tr key={g.key} className="border-b border-white/5">
                <td className="py-2 pr-3 capitalize truncate max-w-[120px]">{g.label}</td>
                <td className="py-2 pr-3 font-mono tabular-nums">{money(g.revenue, reporting)}</td>
                <td className="py-2 pr-3 tabular-nums">{g.orders}</td>
                <td className="py-2 pr-3 tabular-nums text-emerald-400">{rate(g.success_rate)}</td>
                <td className="py-2 pr-3 tabular-nums text-destructive">{rate(g.failure_rate)}</td>
                <td className="py-2 pr-3 tabular-nums">{rate(g.refund_rate)}</td>
                <td className="py-2 pr-3 tabular-nums">{g.avg_processing_hours == null ? "No data" : `${g.avg_processing_hours.toFixed(1)}h`}</td>
                <td className="py-2"><Trend delta={g.growth} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

/** Global Financial Intelligence — India vs International vs Global. */
export function GlobalFinancePanel({ data }: { data: GlobalFinance }) {
  const [scope, setScope] = useState<Scope>("global");
  const reporting = data.reporting_currency;
  const k = data.scopes[scope];

  if (!data.has_any_data) {
    return (
      <Panel title="Global financial intelligence">
        <EmptyState
          title="No financial data available yet."
          hint="India, international and global analytics populate automatically once the marketplace records its first payment."
        />
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-3 gap-3">
        <RevenueCard k={data.scopes.india} reporting={reporting} />
        <RevenueCard k={data.scopes.international} reporting={reporting} />
        <RevenueCard k={data.scopes.global} reporting={reporting} />
      </div>

      <p className="text-[10px] text-muted-foreground px-1">
        <Coins className="inline size-3 mr-1 text-accent" />
        {data.rates_note}
      </p>

      <div className="sticky top-0 z-10 -mx-1 px-1 py-2 backdrop-blur-xl">
        <div className="inline-flex rounded-2xl border border-white/10 bg-white/[0.03] p-1 gap-1">
          {(["india", "international", "global"] as Scope[]).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={`rounded-xl px-3 py-1.5 text-[11px] transition ${
                scope === s ? "bg-accent/15 text-accent border border-accent/30" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {SCOPE_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      {k.has_data ? (
        <ScopeKpiGrid k={k} reporting={reporting} />
      ) : (
        <Panel title={SCOPE_LABEL[scope]}>
          <EmptyState
            title={scope === "international" ? "No international transactions yet." : "No data for this region yet."}
            hint="Once orders are paid in this region, every KPI populates automatically."
          />
        </Panel>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title="Revenue by region" hint={`Daily, last ${data.window_days} days · ${reporting}`}>
          {data.series.length ? (
            <div className="h-52 -ml-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.series} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="v6In" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="v6Intl" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 6" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="date" tick={axis} tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis tick={axis} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => compact(v)} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => money(v, reporting)} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Area type="monotone" dataKey="india" name="India" stroke="hsl(var(--accent))" fill="url(#v6In)" strokeWidth={2} />
                  <Area type="monotone" dataKey="international" name="International" stroke="#38bdf8" fill="url(#v6Intl)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="No regional revenue recorded yet." />
          )}
        </Panel>

        <Panel title="Revenue share" hint="India vs international">
          {data.region_split.length ? (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data.region_split} dataKey="v" nameKey="k" innerRadius={48} outerRadius={78} paddingAngle={3}>
                    {data.region_split.map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => money(v, reporting)} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="No revenue split available yet." />
          )}
        </Panel>
      </div>

      <CountryTable rows={data.countries} reporting={reporting} />

      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title="Revenue by currency" hint="Native amount · reporting value · growth">
          {data.currencies.length ? (
            <div className="overflow-x-auto -mx-1 px-1">
              <table className="w-full min-w-[460px] text-[11px]">
                <thead className="text-[9px] uppercase tracking-widest text-muted-foreground">
                  <tr className="border-b border-white/10 text-left">
                    <th className="py-2 pr-3">Currency</th>
                    <th className="py-2 pr-3">Revenue</th>
                    <th className="py-2 pr-3">In {reporting}</th>
                    <th className="py-2 pr-3">Orders</th>
                    <th className="py-2 pr-3">Growth</th>
                    <th className="py-2 pr-3">Refund %</th>
                    <th className="py-2">AOV</th>
                  </tr>
                </thead>
                <tbody>
                  {data.currencies.map((c) => (
                    <tr key={c.currency} className="border-b border-white/5">
                      <td className="py-2 pr-3 font-mono">{c.currency}</td>
                      <td className="py-2 pr-3 font-mono tabular-nums">{money(c.revenue_native, c.currency)}</td>
                      <td className="py-2 pr-3 font-mono tabular-nums text-muted-foreground">{money(c.revenue_reporting, reporting)}</td>
                      <td className="py-2 pr-3 tabular-nums">{c.orders}</td>
                      <td className="py-2 pr-3"><Trend delta={c.growth} /></td>
                      <td className="py-2 pr-3 tabular-nums">{rate(c.refund_rate)}</td>
                      <td className="py-2 font-mono tabular-nums">{money(c.aov, c.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No currency data available yet." />
          )}
        </Panel>

        <Panel title="Orders by region" hint="Captured payments per region">
          {data.region_split.length ? (
            <div className="h-52 -ml-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.region_split} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="2 6" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="k" tick={axis} tickLine={false} axisLine={false} />
                  <YAxis tick={axis} tickLine={false} axisLine={false} width={40} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="n" name="orders" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="No order data available yet." />
          )}
        </Panel>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <GatewayTable title="🇮🇳 India payment routes" rows={data.gateways.india} reporting={reporting} empty="No domestic gateway activity yet." />
        <GatewayTable title="🌍 International payment routes" rows={data.gateways.international} reporting={reporting} empty="No international gateway activity yet." />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Panel title="Tax intelligence" hint="Recorded tax only">
          <ul className="space-y-2">
            {data.taxes.map((t) => (
              <li key={t.key} className="flex items-start justify-between gap-3 text-[11px]">
                <div className="min-w-0">
                  <p className="truncate">{t.label}</p>
                  <p className="text-[9px] text-muted-foreground truncate">{t.note}</p>
                </div>
                <span className="font-mono tabular-nums shrink-0">
                  {t.amount == null ? <span className="text-muted-foreground">No data</span> : money(t.amount, reporting)}
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="🇮🇳 India settlements" hint="Pending · completed · next">
          <EmptyState title="No settlement data available." hint={data.settlements.india.note} />
        </Panel>

        <Panel title="🌍 International settlements" hint="Pending · completed · next">
          <EmptyState title="No settlement data available." hint={data.settlements.international.note} />
        </Panel>
      </div>

      <Panel title="Vendor revenue" hint="Commission · net earnings · payouts">
        {data.vendors.enabled && data.vendors.rows.length ? (
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full min-w-[560px] text-[11px]">
              <thead className="text-[9px] uppercase tracking-widest text-muted-foreground">
                <tr className="border-b border-white/10 text-left">
                  <th className="py-2 pr-3">Vendor</th>
                  <th className="py-2 pr-3">Combined</th>
                  <th className="py-2 pr-3">Commission</th>
                  <th className="py-2 pr-3">Net earnings</th>
                  <th className="py-2 pr-3">Pending payout</th>
                  <th className="py-2">Completed payout</th>
                </tr>
              </thead>
              <tbody>
                {data.vendors.rows.map((v) => (
                  <tr key={v.vendor_id} className="border-b border-white/5">
                    <td className="py-2 pr-3 truncate max-w-[160px]">
                      <Store className="inline size-3 mr-1 text-accent" />{v.vendor}
                    </td>
                    <td className="py-2 pr-3 font-mono tabular-nums">{money(v.combined, reporting)}</td>
                    <td className="py-2 pr-3 font-mono tabular-nums">{v.commission == null ? "No data" : money(v.commission, reporting)}</td>
                    <td className="py-2 pr-3 font-mono tabular-nums">{v.net_earnings == null ? "No data" : money(v.net_earnings, reporting)}</td>
                    <td className="py-2 pr-3 font-mono tabular-nums text-amber-400">{money(v.pending_payout, reporting)}</td>
                    <td className="py-2 font-mono tabular-nums text-emerald-400">{money(v.completed_payout, reporting)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[9px] text-muted-foreground">
              Regional vendor revenue split requires vendor-level order attribution, which is not recorded yet — combined figures come from recorded payouts and commissions only.
            </p>
          </div>
        ) : (
          <EmptyState title="No vendor revenue data available yet." hint="Vendor analytics populate once vendors and payouts are recorded." />
        )}
      </Panel>

      <Panel title="AI financial intelligence" hint="Derived from recorded marketplace data only">
        {data.insights.length ? (
          <ul className="space-y-2">
            {data.insights.map((i) => (
              <li key={i.id} className="flex items-start gap-2.5 rounded-xl border border-white/10 p-2.5">
                <span className="text-sm leading-none pt-0.5">
                  {i.tone === "good" ? "🟢" : i.tone === "info" ? "🔵" : i.tone === "warn" ? "🟡" : "🔴"}
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium">{i.title}</p>
                  <p className="text-[10px] text-muted-foreground">{i.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No insights available yet." hint="Recommendations appear once enough real activity is recorded." />
        )}
      </Panel>

      <Panel title="Data & security notes">
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          <ShieldCheck className="inline size-3 mr-1 text-accent" />
          Every figure is aggregated from recorded orders, payments, refunds and payouts. No transaction identifiers or
          customer payment details are exposed here, and metrics without a source — settlements, customs and import
          duties — are shown as “No data available” instead of an estimate.
        </p>
      </Panel>
    </div>
  );
}
