import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, AlertTriangle, BadgeIndianRupee, Banknote, Building2, CircleDollarSign, Coins,
  Download, Gauge, HeartPulse, Landmark, LineChart, Repeat, Sparkles, TrendingUp, Users, Wallet,
} from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { SegmentedTabs } from "@/components/admin/SegmentedTabs";
import {
  BarList, EmptyState, Panel, StatKpi, Trend, compact, downloadCsv, maskId, money, when,
} from "./ui";
import type {
  CFODashboard, FinanceAlert, HealthFactor, Rank, TimelineEvent,
} from "@/lib/payments-cfo-v7.functions";

/** Payments Center v7.0 — CFO Dashboard. Pure presentation of real aggregates. */

export type CFODrill = { target: "ledger"; status?: string };

const NA = <span className="text-muted-foreground">No data available</span>;
const val = (v: number | null | undefined, fmt: (n: number) => string) => (v == null ? NA : fmt(v));
const inr = (n: number) => money(n, "INR");
const pctStr = (v: number | null | undefined) => (v == null ? NA : `${v.toFixed(1)}%`);

type Sub = "exec" | "profit" | "vendors" | "gateways" | "refunds" | "tax" | "timeline" | "reports";

const BAND: Record<string, { label: string; tone: string; ring: string }> = {
  excellent: { label: "Excellent", tone: "text-emerald-400", ring: "stroke-emerald-400" },
  good: { label: "Good", tone: "text-sky-400", ring: "stroke-sky-400" },
  attention: { label: "Needs attention", tone: "text-amber-400", ring: "stroke-amber-400" },
  critical: { label: "Critical", tone: "text-destructive", ring: "stroke-destructive" },
};

function HealthDial({ score, band }: { score: number | null; band: string | null }) {
  const b = band ? BAND[band] : null;
  const r = 42;
  const c = 2 * Math.PI * r;
  const filled = score == null ? 0 : (score / 100) * c;
  return (
    <div className="flex items-center gap-4">
      <div className="relative size-28 shrink-0">
        <svg viewBox="0 0 100 100" className="size-full -rotate-90">
          <circle cx="50" cy="50" r={r} className="fill-none stroke-white/8" strokeWidth="8" />
          <circle
            cx="50" cy="50" r={r}
            className={`fill-none ${b?.ring ?? "stroke-white/15"} transition-[stroke-dasharray] duration-700`}
            strokeWidth="8" strokeLinecap="round"
            strokeDasharray={`${filled} ${c}`}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="text-2xl font-semibold tabular-nums">{score ?? "—"}</p>
            <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground">/ 100</p>
          </div>
        </div>
      </div>
      <div className="min-w-0">
        <p className={`text-sm font-semibold ${b?.tone ?? "text-muted-foreground"}`}>
          {b?.label ?? "No data available"}
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Computed from live marketplace data only. Factors without a source are excluded from the score.
        </p>
      </div>
    </div>
  );
}

function FactorRow({ f }: { f: HealthFactor }) {
  const tone = f.score == null ? "bg-white/10" : f.score >= 80 ? "bg-emerald-400/70" : f.score >= 60 ? "bg-sky-400/70" : f.score >= 40 ? "bg-amber-400/70" : "bg-destructive/70";
  return (
    <li className="min-w-0">
      <div className="flex items-baseline justify-between gap-3 text-[11px]">
        <span className="truncate">{f.label}</span>
        <span className="font-mono tabular-nums shrink-0 text-muted-foreground">
          {f.score == null ? "No data" : `${Math.round(f.score)}`}
        </span>
      </div>
      <div className="mt-1 h-1 rounded-full bg-white/5 overflow-hidden">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${f.score ?? 0}%` }} />
      </div>
      <p className="mt-1 text-[10px] text-muted-foreground/80 truncate">{f.detail}</p>
    </li>
  );
}

function FlowRow({ label, value, negative }: { label: string; value: number | null; negative?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-white/5 last:border-0">
      <span className="text-[11px] text-muted-foreground truncate">{label}</span>
      <span className={`text-[12px] font-mono tabular-nums shrink-0 ${negative && value ? "text-destructive" : ""}`}>
        {value == null ? NA : `${negative ? "−" : ""}${inr(Math.abs(value))}`}
      </span>
    </div>
  );
}

function RankPanel({ title, rows, asMoney = true }: { title: string; rows: Rank[]; asMoney?: boolean }) {
  return (
    <Panel title={title}>
      <BarList items={rows.map((r) => ({ k: r.label, v: r.value, n: r.count }))} asMoney={asMoney} />
    </Panel>
  );
}

function AlertCard({ a, onDrill }: { a: FinanceAlert; onDrill: (d: CFODrill) => void }) {
  const tone = a.severity === "critical"
    ? "border-destructive/30 bg-destructive/10 text-destructive"
    : a.severity === "warn"
      ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
      : "border-white/10 bg-white/5 text-muted-foreground";
  return (
    <div className={`rounded-2xl border p-3 ${tone}`}>
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-3.5 shrink-0" />
        <p className="text-[11px] font-semibold truncate">{a.title}</p>
      </div>
      <p className="mt-1 text-[10px] text-muted-foreground">{a.detail}</p>
      {a.action && (
        <button
          onClick={() => onDrill({ target: "ledger", status: a.action?.status })}
          className="mt-2 text-[10px] font-mono uppercase tracking-widest underline underline-offset-4"
        >
          {a.action.label}
        </button>
      )}
    </div>
  );
}

export function CFOPanel({
  data, onDrill, windowDays, onAuditExport,
}: {
  data: CFODashboard;
  onDrill: (d: CFODrill) => void;
  windowDays: number;
  onAuditExport: (report: string) => void;
}) {
  const [sub, setSub] = useState<Sub>("exec");
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | TimelineEvent["kind"]>("all");
  const [shown, setShown] = useState(30);
  const sentinel = useRef<HTMLDivElement>(null);

  const p = data.profitability;
  const cf = data.cash_flow;

  const timeline = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.timeline.filter(
      (e) => (kind === "all" || e.kind === kind) &&
        (!needle || `${e.title} ${e.detail} ${e.status ?? ""}`.toLowerCase().includes(needle)),
    );
  }, [data.timeline, q, kind]);

  useEffect(() => { setShown(30); }, [q, kind, sub]);

  // Infinite scroll over the already-loaded timeline (no extra requests).
  useEffect(() => {
    if (sub !== "timeline") return;
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) setShown((s) => Math.min(s + 30, timeline.length));
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [sub, timeline.length]);

  const exportReport = useCallback((report: string, headers: string[], rows: (string | number)[][]) => {
    downloadCsv(`foundourmarket-${report}-${new Date().toISOString().slice(0, 10)}`, headers, rows);
    onAuditExport(report);
  }, [onAuditExport]);

  const summaryRows = useMemo<(string | number)[][]>(() => ([
    ["Financial health score", data.health.score ?? "No data available"],
    ["Gross revenue", p.gross_revenue ?? "No data available"],
    ["Shipping revenue", p.shipping_revenue ?? "No data available"],
    ["Tax collected", p.tax_collected ?? "No data available"],
    ["Discounts", p.discounts ?? "No data available"],
    ["Coupons", p.coupons ?? "No data available"],
    ["Gateway fees", p.gateway_fees ?? "No data available"],
    ["Platform commission", p.platform_commission ?? "No data available"],
    ["Vendor share", p.vendor_share ?? "No data available"],
    ["Estimated net platform revenue", p.estimated_net ?? "No data available"],
    ["Revenue today", data.live.today],
    ["Revenue this week", data.live.week],
    ["Revenue this month", data.live.month],
    ["Revenue YTD", data.live.ytd],
    ["Refund amount", data.refunds.total_amount],
    ["Refund count", data.refunds.count],
  ]), [data, p]);

  return (
    <div className="space-y-4">
      <SegmentedTabs
        value={sub}
        onChange={setSub}
        layoutId="cfo-sub"
        items={[
          { value: "exec", label: "Executive", icon: <HeartPulse className="size-3" /> },
          { value: "profit", label: "Profit & Cash", icon: <CircleDollarSign className="size-3" /> },
          { value: "vendors", label: "Vendors", icon: <Building2 className="size-3" /> },
          { value: "gateways", label: "Gateways", icon: <Gauge className="size-3" /> },
          { value: "refunds", label: "Refunds", icon: <Repeat className="size-3" /> },
          { value: "tax", label: "Tax & Currency", icon: <Landmark className="size-3" /> },
          { value: "timeline", label: "Timeline", icon: <Activity className="size-3" /> },
          { value: "reports", label: "Reports", icon: <Download className="size-3" /> },
        ]}
      />

      {/* ───────────────────────────────────────────────── Executive */}
      {sub === "exec" && (
        <div className="space-y-4">
          <Panel title="Executive financial health" hint={`Last ${windowDays} days · ${data.health.covered}/${data.health.factors.length} factors with data`}>
            <div className="grid gap-5 md:grid-cols-[auto_minmax(0,1fr)]">
              <HealthDial score={data.health.score} band={data.health.band} />
              <ul className="space-y-2.5 min-w-0">
                {data.health.factors.map((f) => <FactorRow key={f.id} f={f} />)}
              </ul>
            </div>
          </Panel>

          <Panel title="Live revenue" hint="Refreshes with the marketplace realtime feed — no simulated movement">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
              <StatKpi label="Today" value={inr(data.live.today)} sub={`${data.live.orders_today} paid order(s)`} icon={<BadgeIndianRupee className="size-3" />} />
              <StatKpi label="This week" value={inr(data.live.week)} icon={<TrendingUp className="size-3" />} />
              <StatKpi label="This month" value={inr(data.live.month)} icon={<LineChart className="size-3" />} />
              <StatKpi label="Year to date" value={inr(data.live.ytd)} icon={<Wallet className="size-3" />} />
            </div>
          </Panel>

          {data.recommendation && (
            <Panel title="Smart finance AI" hint="One prioritised recommendation, derived from real rows">
              <div className="rounded-2xl border border-accent/25 bg-accent/5 p-3.5">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-3.5 text-accent" />
                  <p className="text-[12px] font-semibold">{data.recommendation.headline}</p>
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground">{data.recommendation.reason}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[9px] font-mono uppercase tracking-widest">
                  <span className="rounded-full border border-white/10 px-2 py-0.5 text-muted-foreground">
                    Confidence · {data.recommendation.confidence}
                  </span>
                  <span className="rounded-full border border-white/10 px-2 py-0.5 text-muted-foreground truncate max-w-full">
                    {data.recommendation.impact}
                  </span>
                </div>
                {data.recommendation.action && (
                  <button
                    onClick={() => onDrill({ target: "ledger", status: data.recommendation?.action?.status })}
                    className="mt-2.5 rounded-full bg-accent px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest text-accent-foreground"
                  >
                    {data.recommendation.action.label}
                  </button>
                )}
              </div>
            </Panel>
          )}

          <Panel title="Financial alerts" hint="Raised only when the underlying data crosses a threshold">
            {data.alerts.length ? (
              <div className="grid gap-2.5 sm:grid-cols-2">
                {data.alerts.map((a) => <AlertCard key={a.id} a={a} onDrill={onDrill} />)}
              </div>
            ) : <EmptyState title="No financial alerts" hint="Nothing in the current window crosses an alert threshold." />}
          </Panel>

          <Panel title="Revenue forecast" hint="Forecast · estimated — never presented as recorded revenue">
            {data.forecast.available ? (
              <>
                <div className="grid grid-cols-3 gap-2.5">
                  <StatKpi label="Tomorrow (forecast)" value={val(data.forecast.tomorrow, inr)} />
                  <StatKpi label="Next 7 days (forecast)" value={val(data.forecast.next7, inr)} />
                  <StatKpi label="Next month (forecast)" value={val(data.forecast.next_month, inr)} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                  <span className="rounded-full border border-white/10 px-2 py-0.5">Confidence · {data.forecast.confidence}</span>
                  <span className="rounded-full border border-white/10 px-2 py-0.5">Trend · {data.forecast.trend}</span>
                  <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-amber-400">Estimate</span>
                </div>
                <p className="mt-2 text-[10px] text-muted-foreground/80">{data.forecast.method}</p>
              </>
            ) : <EmptyState title="No data available" hint={data.forecast.method} />}
          </Panel>

          {data.daily.length > 1 && (
            <Panel title="Revenue history" hint="Recorded paid orders only">
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.daily}>
                    <defs>
                      <linearGradient id="cfoRev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 9 }} stroke="rgba(255,255,255,0.25)" />
                    <YAxis tick={{ fontSize: 9 }} stroke="rgba(255,255,255,0.25)" tickFormatter={(v) => compact(v)} width={44} />
                    <Tooltip
                      contentStyle={{ background: "rgba(10,10,14,0.95)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 11 }}
                      formatter={(v: number) => inr(v)}
                    />
                    <Area type="monotone" dataKey="revenue" stroke="var(--accent)" fill="url(#cfoRev)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          )}

          <Panel title="Regional performance" hint="India vs international, computed independently">
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-[11px] min-w-[520px]">
                <thead>
                  <tr className="text-[9px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
                    <th className="text-left py-2">Metric</th>
                    <th className="text-right py-2">🇮🇳 India</th>
                    <th className="text-right py-2">🌍 International</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {([
                    ["Revenue", (r: typeof data.regions[number]) => inr(r.revenue)],
                    ["Profit", (r: typeof data.regions[number]) => (r.profit == null ? "No data available" : inr(r.profit))],
                    ["Refunds", (r: typeof data.regions[number]) => inr(r.refunds)],
                    ["Tax", (r: typeof data.regions[number]) => inr(r.tax)],
                    ["Shipping", (r: typeof data.regions[number]) => inr(r.shipping)],
                    ["Growth", (r: typeof data.regions[number]) => (r.growth == null ? "No data available" : `${r.growth.toFixed(1)}%`)],
                    ["Average order value", (r: typeof data.regions[number]) => (r.aov == null ? "No data available" : inr(r.aov))],
                    ["Orders", (r: typeof data.regions[number]) => String(r.orders)],
                    ["Customers", (r: typeof data.regions[number]) => String(r.customers)],
                    ["Repeat buyers", (r: typeof data.regions[number]) => String(r.repeat_buyers)],
                    ["New buyers", (r: typeof data.regions[number]) => String(r.new_buyers)],
                  ] as const).map(([label, fn]) => (
                    <tr key={label} className="border-t border-white/5">
                      <td className="py-2 text-muted-foreground">{label}</td>
                      <td className="py-2 text-right font-mono">{fn(data.regions[0])}</td>
                      <td className="py-2 text-right font-mono">{fn(data.regions[1])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      )}

      {/* ───────────────────────────────────────────────── Profit & Cash */}
      {sub === "profit" && (
        <div className="space-y-4">
          <Panel title="Profitability waterfall" hint="Revenue is not profit — every line below comes from recorded values">
            <div className="max-w-xl">
              <FlowRow label="Gross revenue" value={p.gross_revenue} />
              <FlowRow label="Shipping revenue" value={p.shipping_revenue} />
              <FlowRow label="Tax collected (passed through)" value={p.tax_collected} negative />
              <FlowRow label="Discounts" value={p.discounts} negative />
              <FlowRow label="Coupons" value={p.coupons} negative />
              <FlowRow label="Gateway fees" value={p.gateway_fees} negative />
              <FlowRow label="Platform commission" value={p.platform_commission} />
              <FlowRow label="Vendor share" value={p.vendor_share} negative />
              <div className="flex items-center justify-between gap-3 pt-3 mt-1 border-t border-white/10">
                <span className="text-[11px] font-semibold">
                  Estimated net platform revenue
                  {p.net_is_estimate && <span className="ml-2 text-[9px] font-mono uppercase tracking-widest text-amber-400">estimate</span>}
                </span>
                <span className="text-sm font-mono tabular-nums">{val(p.estimated_net, inr)}</span>
              </div>
            </div>
            {p.net_is_estimate && (
              <p className="mt-2 text-[10px] text-muted-foreground/80">
                Gateway fees and/or platform commission are not recorded for every transaction, so the net figure is an estimate.
              </p>
            )}
          </Panel>

          <Panel title="Cash flow" hint="Positions derived from recorded orders, refunds and payouts">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
              <StatKpi label="Received today" value={val(cf.received_today, inr)} icon={<Banknote className="size-3" />} />
              <StatKpi label="Money pending" value={val(cf.money_pending, inr)} icon={<Wallet className="size-3" />} />
              <StatKpi label="Refunds pending" value={val(cf.refunds_pending, inr)} icon={<Repeat className="size-3" />} />
              <StatKpi label="Settlements pending" value={val(cf.settlements_pending, inr)} icon={<Landmark className="size-3" />} />
              <StatKpi label="Vendor payments pending" value={val(cf.vendor_payments_pending, inr)} icon={<Building2 className="size-3" />} />
              <StatKpi label="Money released" value={val(cf.money_released, inr)} icon={<Coins className="size-3" />} />
              <StatKpi label="Money on hold" value={val(cf.money_on_hold, inr)} icon={<Gauge className="size-3" />} />
            </div>
          </Panel>

          <Panel title="Customer spending intelligence" hint="Customer identifiers are masked — no PII is exposed">
            {data.customers.has_data ? (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                <StatKpi label="Highest lifetime customer" value={data.customers.top_lifetime ? inr(data.customers.top_lifetime.value) : NA}
                  sub={data.customers.top_lifetime ? maskId(data.customers.top_lifetime.key) : undefined} icon={<Users className="size-3" />} />
                <StatKpi label="Highest today" value={data.customers.top_today ? inr(data.customers.top_today.value) : NA}
                  sub={data.customers.top_today ? maskId(data.customers.top_today.key) : undefined} />
                <StatKpi label="Highest this month" value={data.customers.top_month ? inr(data.customers.top_month.value) : NA}
                  sub={data.customers.top_month ? maskId(data.customers.top_month.key) : undefined} />
                <StatKpi label="Repeat customers" value={String(data.customers.repeat_customers)} />
                <StatKpi label="First-time buyers" value={String(data.customers.first_time_buyers)} />
                <StatKpi label="Returning buyer %" value={pctStr(data.customers.returning_pct)} />
                <StatKpi label="Average customer value" value={val(data.customers.avg_customer_value, inr)} />
                <StatKpi label="Lifetime value" value={val(data.customers.lifetime_value, inr)} />
              </div>
            ) : <EmptyState title="No data available" hint="Customer spending appears once paid orders are recorded." />}
          </Panel>

          <Panel title="Settlement center" hint="Sourced from the vendor payout feed">
            {data.settlements.available ? (
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5">
                {data.settlements.buckets.map((b) => (
                  <StatKpi key={b.key} label={b.label} value={inr(b.amount)} sub={`${b.count} record(s)`} />
                ))}
              </div>
            ) : <EmptyState title="No settlement feed connected" hint="Settlement stages appear here once payout records exist." />}
          </Panel>
        </div>
      )}

      {/* ───────────────────────────────────────────────── Vendors */}
      {sub === "vendors" && (
        <Panel
          title="Vendor financial performance"
          hint="Ranked by attributed revenue in this window"
          actions={data.vendors.length ? (
            <button
              onClick={() => exportReport("vendor-performance",
                ["Vendor", "Revenue", "Orders", "Refunds", "Refund rate %", "Growth %", "Average order", "Platform earnings", "Settlement"],
                data.vendors.map((v) => [v.name, v.revenue, v.orders, v.refunds, v.refund_rate ?? "No data available",
                  v.growth ?? "No data available", v.aov ?? "No data available", v.platform_earnings ?? "No data available", v.settlement_status]))}
              className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground"
            >
              Export
            </button>
          ) : undefined}
        >
          {data.vendors.length ? (
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-[11px] min-w-[720px]">
                <thead>
                  <tr className="text-[9px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
                    <th className="text-left py-2">Vendor</th>
                    <th className="text-right py-2">Revenue</th>
                    <th className="text-right py-2">Orders</th>
                    <th className="text-right py-2">Refunds</th>
                    <th className="text-right py-2">Refund %</th>
                    <th className="text-right py-2">Growth</th>
                    <th className="text-right py-2">Avg order</th>
                    <th className="text-right py-2">Platform earnings</th>
                    <th className="text-right py-2">Settlement</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {data.vendors.map((v) => (
                    <tr key={v.vendor_id} className="border-t border-white/5">
                      <td className="py-2 truncate max-w-[180px]">{v.name}</td>
                      <td className="py-2 text-right font-mono">{inr(v.revenue)}</td>
                      <td className="py-2 text-right font-mono">{v.orders}</td>
                      <td className="py-2 text-right font-mono">{inr(v.refunds)}</td>
                      <td className="py-2 text-right font-mono">{v.refund_rate == null ? "—" : `${v.refund_rate.toFixed(1)}%`}</td>
                      <td className="py-2 text-right"><Trend delta={v.growth} /></td>
                      <td className="py-2 text-right font-mono">{v.aov == null ? "—" : inr(v.aov)}</td>
                      <td className="py-2 text-right font-mono">{v.platform_earnings == null ? "No data" : inr(v.platform_earnings)}</td>
                      <td className="py-2 text-right text-muted-foreground">{v.settlement_status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState title="No data available" hint="Vendor performance appears once vendor products are sold." />}
        </Panel>
      )}

      {/* ───────────────────────────────────────────────── Gateways */}
      {sub === "gateways" && (
        <Panel title="Gateway intelligence" hint="Razorpay, Stripe, PayPal, manual and COD compared on recorded activity">
          {data.gateways.length ? (
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-[11px] min-w-[760px]">
                <thead>
                  <tr className="text-[9px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
                    <th className="text-left py-2">Gateway</th>
                    <th className="text-right py-2">Revenue</th>
                    <th className="text-right py-2">Orders</th>
                    <th className="text-right py-2">Success %</th>
                    <th className="text-right py-2">Failure %</th>
                    <th className="text-right py-2">Refund %</th>
                    <th className="text-right py-2">Avg processing</th>
                    <th className="text-right py-2">Avg order</th>
                    <th className="text-right py-2">Availability</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {data.gateways.map((g) => (
                    <tr key={g.key} className="border-t border-white/5">
                      <td className="py-2 capitalize truncate max-w-[150px]">{g.label}</td>
                      <td className="py-2 text-right font-mono">{inr(g.revenue)}</td>
                      <td className="py-2 text-right font-mono">{g.orders}</td>
                      <td className="py-2 text-right font-mono">{g.success_rate == null ? "No data" : `${g.success_rate.toFixed(1)}%`}</td>
                      <td className="py-2 text-right font-mono">{g.failure_rate == null ? "No data" : `${g.failure_rate.toFixed(1)}%`}</td>
                      <td className="py-2 text-right font-mono">{g.refund_rate == null ? "No data" : `${g.refund_rate.toFixed(1)}%`}</td>
                      <td className="py-2 text-right font-mono">{g.avg_processing_ms == null ? "No latency data" : `${(g.avg_processing_ms / 1000).toFixed(1)}s`}</td>
                      <td className="py-2 text-right font-mono">{g.aov == null ? "—" : inr(g.aov)}</td>
                      <td className="py-2 text-right text-muted-foreground">{g.availability ?? "No data"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState title="No data available" hint="Gateway comparison appears once payments are recorded." />}
        </Panel>
      )}

      {/* ───────────────────────────────────────────────── Refunds */}
      {sub === "refunds" && (
        <div className="space-y-4">
          <Panel title="Refund intelligence" hint={`${data.refunds.count} refund record(s) in this window`}>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
              <StatKpi label="Refund amount" value={inr(data.refunds.total_amount)} />
              <StatKpi label="Refund records" value={String(data.refunds.count)} />
              <StatKpi label="Distinct reasons" value={String(data.refunds.reasons.length)} />
              <StatKpi label="Categories" value={String(data.refunds.categories.length)} />
            </div>
          </Panel>
          <div className="grid gap-4 lg:grid-cols-2">
            <RankPanel title="Refund reasons" rows={data.refunds.reasons} />
            <RankPanel title="Refund categories" rows={data.refunds.categories} />
            <RankPanel title="Top refunded products" rows={data.refunds.top_products} />
            <RankPanel title="Top refunded vendors" rows={data.refunds.top_vendors} />
            <RankPanel title="Countries with highest refunds" rows={data.refunds.top_countries} />
            <RankPanel title="States with highest refunds" rows={data.refunds.top_states} />
          </div>
          <Panel title="Refund trend">
            {data.refunds.trend.length ? (
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.refunds.trend}>
                    <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 9 }} stroke="rgba(255,255,255,0.25)" />
                    <YAxis tick={{ fontSize: 9 }} stroke="rgba(255,255,255,0.25)" tickFormatter={(v) => compact(v)} width={44} />
                    <Tooltip
                      contentStyle={{ background: "rgba(10,10,14,0.95)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 11 }}
                      formatter={(v: number) => inr(v)}
                    />
                    <Area type="monotone" dataKey="value" stroke="var(--destructive)" fill="rgba(248,113,113,0.15)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : <EmptyState title="No data available" />}
          </Panel>
        </div>
      )}

      {/* ───────────────────────────────────────────────── Tax & currency */}
      {sub === "tax" && (
        <div className="space-y-4">
          {data.tax.has_data ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title="🇮🇳 India GST">
                <div className="grid grid-cols-3 gap-2.5">
                  <StatKpi label="Collected" value={inr(data.tax.india.collected)} />
                  <StatKpi label="Pending" value={inr(data.tax.india.pending)} />
                  <StatKpi label="Returned" value={inr(data.tax.india.returned)} />
                </div>
                <div className="mt-3 space-y-3">
                  <div>
                    <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-1.5">By state</p>
                    <BarList items={data.tax.india.by_state.map((r) => ({ k: r.label, v: r.value, n: r.count }))} />
                  </div>
                  <div>
                    <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-1.5">By month</p>
                    <BarList items={data.tax.india.by_month.map((r) => ({ k: r.label, v: r.value, n: r.count }))} />
                  </div>
                </div>
              </Panel>
              <Panel title="🌍 International VAT">
                <div className="grid grid-cols-3 gap-2.5">
                  <StatKpi label="Collected" value={inr(data.tax.international.collected)} />
                  <StatKpi label="Pending" value={inr(data.tax.international.pending)} />
                  <StatKpi label="Returned" value={inr(data.tax.international.returned)} />
                </div>
                <div className="mt-3 space-y-3">
                  <div>
                    <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-1.5">By country</p>
                    <BarList items={data.tax.international.by_country.map((r) => ({ k: r.label, v: r.value, n: r.count }))} />
                  </div>
                  <div>
                    <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-1.5">By month</p>
                    <BarList items={data.tax.international.by_month.map((r) => ({ k: r.label, v: r.value, n: r.count }))} />
                  </div>
                </div>
              </Panel>
            </div>
          ) : <Panel title="Tax dashboard"><EmptyState title="No data available" hint="GST and VAT figures appear once taxed orders are recorded." /></Panel>}

          <Panel title="Currency intelligence" hint={data.currencies.conversion_note}>
            {data.currencies.has_data ? (
              <div className="overflow-x-auto -mx-4 px-4">
                <table className="w-full text-[11px] min-w-[520px]">
                  <thead>
                    <tr className="text-[9px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
                      <th className="text-left py-2">Currency</th>
                      <th className="text-right py-2">Revenue (native)</th>
                      <th className="text-right py-2">Orders</th>
                      <th className="text-right py-2">Avg order (native)</th>
                      <th className="text-right py-2">Share</th>
                      <th className="text-right py-2">Growth</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {data.currencies.rows.map((c) => (
                      <tr key={c.code} className="border-t border-white/5">
                        <td className="py-2 font-mono">
                          {c.code}
                          {data.currencies.largest === c.code && (
                            <span className="ml-2 text-[8px] font-mono uppercase tracking-widest text-accent">largest</span>
                          )}
                        </td>
                        <td className="py-2 text-right font-mono">{money(c.revenue_native, c.code)}</td>
                        <td className="py-2 text-right font-mono">{c.orders}</td>
                        <td className="py-2 text-right font-mono">{money(c.aov_native, c.code)}</td>
                        <td className="py-2 text-right font-mono">{c.share == null ? "No data" : `${c.share.toFixed(1)}%`}</td>
                        <td className="py-2 text-right"><Trend delta={c.growth} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <EmptyState title="No data available" />}
          </Panel>
        </div>
      )}

      {/* ───────────────────────────────────────────────── Timeline */}
      {sub === "timeline" && (
        <Panel title="Financial timeline" hint="Payments, refunds, exports, admin, finance and security activity">
          <div className="flex flex-wrap gap-2 mb-3">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search timeline"
              className="flex-1 min-w-[160px] bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 text-[11px] focus:outline-none focus:border-accent/40"
            />
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
              className="bg-white/[0.03] border border-white/10 rounded-xl px-2.5 py-2 text-[11px] focus:outline-none focus:border-accent/40"
            >
              {["all", "payment", "refund", "export", "admin", "finance", "security"].map((k) => (
                <option key={k} value={k} className="bg-background">{k}</option>
              ))}
            </select>
          </div>
          {timeline.length ? (
            <>
              <ul className="space-y-1.5">
                {timeline.slice(0, shown).map((e) => (
                  <li key={e.id} className="flex items-start gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2">
                    <span className="mt-0.5 text-[8px] font-mono uppercase tracking-widest text-muted-foreground w-16 shrink-0">{e.kind}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] capitalize truncate">{e.title}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{e.detail}</p>
                    </div>
                    <div className="text-right shrink-0">
                      {e.amount != null && <p className="text-[11px] font-mono tabular-nums">{money(e.amount, e.currency ?? "INR")}</p>}
                      <p className="text-[9px] text-muted-foreground">{when(e.at)}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <div ref={sentinel} className="h-6" />
              {shown < timeline.length && (
                <p className="text-center text-[10px] text-muted-foreground">Loading more…</p>
              )}
            </>
          ) : <EmptyState title="No data available" hint="Financial activity appears here as it happens." />}
        </Panel>
      )}

      {/* ───────────────────────────────────────────────── Reports */}
      {sub === "reports" && (
        <Panel title="Executive reports" hint="Generated from the data already loaded — every export is audited">
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {([
              ["Finance summary", "finance-summary", ["Metric", "Value"], summaryRows],
              ["Daily revenue", "daily-revenue",
                ["Day", "Revenue", "Orders", "Refunds"],
                data.daily.map((d) => [d.day, d.revenue, d.orders, d.refunds])],
              ["Vendor report", "vendor-report",
                ["Vendor", "Revenue", "Orders", "Refunds", "Settlement"],
                data.vendors.map((v) => [v.name, v.revenue, v.orders, v.refunds, v.settlement_status])],
              ["Gateway report", "gateway-report",
                ["Gateway", "Revenue", "Orders", "Success %", "Failure %"],
                data.gateways.map((g) => [g.label, g.revenue, g.orders, g.success_rate ?? "No data available", g.failure_rate ?? "No data available"])],
              ["Regional report", "regional-report",
                ["Region", "Revenue", "Orders", "Refunds", "Tax", "Customers"],
                data.regions.map((r) => [r.region, r.revenue, r.orders, r.refunds, r.tax, r.customers])],
              ["Tax report", "tax-report",
                ["Scope", "Collected", "Pending", "Returned"],
                [["India GST", data.tax.india.collected, data.tax.india.pending, data.tax.india.returned],
                 ["International VAT", data.tax.international.collected, data.tax.international.pending, data.tax.international.returned]]],
            ] as const).map(([label, slug, headers, rows]) => (
              <button
                key={slug}
                disabled={!rows.length}
                onClick={() => exportReport(slug, [...headers], rows as (string | number)[][])}
                className="glass border border-white/10 rounded-2xl p-3.5 text-left disabled:opacity-40"
              >
                <div className="flex items-center gap-2">
                  <Download className="size-3.5 text-accent" />
                  <p className="text-[11px] font-semibold">{label}</p>
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {rows.length ? `${rows.length} row(s) · CSV` : "No data available"}
                </p>
              </button>
            ))}
          </div>
          <p className="mt-3 text-[10px] text-muted-foreground/80">
            Reports cover the selected {windowDays}-day window. Change the window above for today, weekly, monthly, quarterly or yearly scopes.
          </p>
        </Panel>
      )}
    </div>
  );
}
