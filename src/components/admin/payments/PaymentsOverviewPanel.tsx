import { AreaChart, Area, BarChart, Bar, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import {
  IndianRupee, ShoppingBag, Wallet, Clock, XCircle, RotateCcw, ShieldAlert,
  Loader2, Gauge, TrendingUp, Landmark, Plug,
} from "lucide-react";
import type { PaymentsOverview } from "@/lib/payments-center-v3.functions";
import { BarList, EmptyState, Panel, StatKpi, StatusBadge, money, when, compact } from "./ui";

const axis = { stroke: "hsl(var(--muted-foreground))", fontSize: 10 } as const;

function ChartFrame({ children }: { children: React.ReactElement }) {
  return (
    <div className="h-52 -ml-2">
      <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
    </div>
  );
}

const tooltipStyle = {
  background: "hsl(var(--background))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 12,
  fontSize: 11,
};

export function PaymentsOverviewPanel({ data }: { data: PaymentsOverview }) {
  const k = data.kpis;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2.5">
        <StatKpi label="Today's Revenue" icon={<IndianRupee className="size-3.5" />} value={money(k.today_revenue)} delta={k.deltas.today_revenue} sub="vs yesterday" />
        <StatKpi label="Today's Orders" icon={<ShoppingBag className="size-3.5" />} value={k.today_orders} delta={k.deltas.today_orders} sub="vs yesterday" />
        <StatKpi label="Total Collected" icon={<Wallet className="size-3.5" />} value={money(k.total_collected)} delta={k.deltas.total_collected} sub={`last ${data.window_days}d`} />
        <StatKpi label="Pending" icon={<Clock className="size-3.5" />} tone="text-amber-400" value={money(k.pending_amount)} sub={`${k.pending_count} payment(s)`} />
        <StatKpi label="Processing" icon={<Loader2 className="size-3.5" />} tone="text-sky-400" value={money(k.processing_amount)} sub={`${k.processing_count} payment(s)`} />
        <StatKpi label="Failed" icon={<XCircle className="size-3.5" />} tone="text-destructive" value={money(k.failed_amount)} sub={`${k.failed_count} attempt(s)`} />
        <StatKpi label="Refunded" icon={<RotateCcw className="size-3.5" />} tone="text-violet-300" value={money(k.refunded_amount)} delta={k.deltas.refunded_amount} sub={`${k.refunded_count} refund(s)`} />
        <StatKpi label="Chargebacks" icon={<ShieldAlert className="size-3.5" />} tone="text-orange-400" value={k.chargebacks ?? "No data"} sub="no source connected" />
        <StatKpi label="Average Order Value" icon={<Gauge className="size-3.5" />} value={money(k.aov)} delta={k.deltas.aov} />
        <StatKpi
          label="Payment Success Rate"
          icon={<TrendingUp className="size-3.5" />}
          tone="text-emerald-400"
          value={k.success_rate == null ? "No data" : `${k.success_rate.toFixed(1)}%`}
          delta={k.deltas.success_rate}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title="Revenue & orders" hint={`Daily, last ${data.window_days} days`}>
          {data.daily.length ? (
            <ChartFrame>
              <AreaChart data={data.daily} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="pcRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 6" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="date" tick={axis} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis tick={axis} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => compact(v)} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n) => (n === "orders" ? v : money(v))} />
                <Area type="monotone" dataKey="revenue" stroke="hsl(var(--accent))" fill="url(#pcRev)" strokeWidth={2} />
              </AreaChart>
            </ChartFrame>
          ) : (
            <EmptyState hint="Revenue charts appear as soon as the first payment is captured." />
          )}
        </Panel>

        <Panel title="Refunds trend" hint="Refund value per day">
          {data.daily.some((d) => d.refunds > 0) ? (
            <ChartFrame>
              <BarChart data={data.daily} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="2 6" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="date" tick={axis} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis tick={axis} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => compact(v)} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => money(v)} />
                <Bar dataKey="refunds" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartFrame>
          ) : (
            <EmptyState title="No refund data available yet." hint="Refunds recorded in the platform will chart here automatically." />
          )}
        </Panel>
      </div>

      <Panel title="Payment gateways" hint="Live configuration + real transaction performance">
        {data.gateways.length ? (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {data.gateways.map((g) => (
              <div key={g.provider} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Plug className="size-3.5 text-accent shrink-0" />
                    <span className="text-sm font-semibold truncate capitalize">{g.display_name}</span>
                  </div>
                  <StatusBadge status={g.enabled == null ? "unknown" : g.enabled ? (g.configured ? "settled" : "pending") : "cancelled"} />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-y-1.5 text-[11px]">
                  <dt className="text-muted-foreground">Transactions</dt>
                  <dd className="text-right font-mono">{g.transactions || "—"}</dd>
                  <dt className="text-muted-foreground">Success rate</dt>
                  <dd className="text-right font-mono">{g.success_rate == null ? "No data" : `${g.success_rate.toFixed(1)}%`}</dd>
                  <dt className="text-muted-foreground">Failures</dt>
                  <dd className="text-right font-mono">{g.failed || "—"}</dd>
                  <dt className="text-muted-foreground">Revenue</dt>
                  <dd className="text-right font-mono">{g.revenue ? money(g.revenue) : "—"}</dd>
                  <dt className="text-muted-foreground">Last sync</dt>
                  <dd className="text-right font-mono">{g.last_sync ? when(g.last_sync) : "No data"}</dd>
                </dl>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No gateways connected yet." />
        )}
      </Panel>

      <div className="grid lg:grid-cols-3 gap-4">
        <Panel title="Refund queue" hint="Awaiting processing">
          {data.refunds.queue.length ? (
            <ul className="space-y-2">
              {data.refunds.queue.slice(0, 8).map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="font-mono truncate">{r.order_id?.slice(0, 8) ?? "—"}</span>
                  <span className="font-mono">{money(r.amount, r.currency)}</span>
                  <StatusBadge status={r.status} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No refunds in queue." />
          )}
        </Panel>

        <Panel title="Refund performance" hint="Reasons · success rate · turnaround">
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="rounded-xl border border-white/10 p-2.5">
              <p className="text-[9px] uppercase tracking-widest text-muted-foreground">Success rate</p>
              <p className="text-sm font-semibold">{data.refunds.success_rate == null ? "No data" : `${data.refunds.success_rate.toFixed(1)}%`}</p>
            </div>
            <div className="rounded-xl border border-white/10 p-2.5">
              <p className="text-[9px] uppercase tracking-widest text-muted-foreground">Avg refund time</p>
              <p className="text-sm font-semibold">{data.refunds.avg_hours == null ? "No data" : `${data.refunds.avg_hours.toFixed(1)}h`}</p>
            </div>
          </div>
          <BarList items={data.refunds.reasons} empty="No refund reasons recorded." />
        </Panel>

        <Panel title="Settlements" hint="Upcoming · completed · pending · failed">
          <EmptyState
            title="No settlement data available yet."
            hint="Settlement reports appear here once a gateway settlement feed is connected. Nothing is estimated or simulated."
          />
        </Panel>
      </div>

      <Panel title="Refund history" hint="Most recent refunds">
        {data.refunds.history.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead className="text-[9px] uppercase tracking-widest text-muted-foreground">
                <tr className="border-b border-white/10 text-left">
                  <th className="py-2 pr-3">Order</th><th className="py-2 pr-3">Amount</th>
                  <th className="py-2 pr-3">Reason</th><th className="py-2 pr-3">Status</th><th className="py-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {data.refunds.history.map((r) => (
                  <tr key={r.id} className="border-b border-white/5">
                    <td className="py-2 pr-3 font-mono">{r.order_id?.slice(0, 8) ?? "—"}</td>
                    <td className="py-2 pr-3 font-mono">{money(r.amount, r.currency)}</td>
                    <td className="py-2 pr-3 capitalize truncate max-w-[220px]">{r.reason ?? "—"}</td>
                    <td className="py-2 pr-3"><StatusBadge status={r.status} /></td>
                    <td className="py-2 text-muted-foreground whitespace-nowrap">{when(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No refund history available yet." />
        )}
      </Panel>

      <Panel title="Financial notes" hint="Data sources">
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          <Landmark className="inline size-3 mr-1 text-accent" />
          All figures are computed from recorded payments, orders and refunds only. Metrics without a
          source in the platform — chargebacks, disputes and gateway settlements — are shown as
          “No data available” instead of an estimate.
        </p>
      </Panel>
    </div>
  );
}
