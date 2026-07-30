import { useMemo, useState } from "react";
import {
  BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
  CartesianGrid, Legend,
} from "recharts";
import { Coins, Lightbulb, Scale } from "lucide-react";

import type {
  RegionalBreakdown, ScopeBreakdown, RegionScope, RankRow,
} from "@/lib/payments-global-v65.functions";
import { BarList, EmptyState, Panel, StatKpi, money, compact } from "./ui";

/** Drill-down request emitted to the Payments Center (opens the filtered ledger). */
export type BreakdownDrill = {
  region?: "all" | "india" | "international";
  status?: string;
  country?: string;
  gateway?: string;
  currency?: string;
};

const SCOPE_LABEL: Record<RegionScope, string> = {
  india: "🇮🇳 India",
  international: "🌍 International",
  global: "🌎 Global marketplace",
};

const tooltipStyle = {
  background: "hsl(var(--background))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 12,
  fontSize: 11,
};
const axis = { stroke: "hsl(var(--muted-foreground))", fontSize: 10 } as const;
const PIE = ["hsl(var(--accent))", "#38bdf8", "#34d399", "#f59e0b", "#a78bfa", "#f472b6"];

const rate = (v: number | null | undefined) => (v == null ? "No data" : `${v.toFixed(1)}%`);
const ledgerRegion = (s: RegionScope): "all" | "india" | "international" => (s === "global" ? "all" : s);

function RankPanel({
  title, hint, rows, empty, asMoney = true, reporting, onPick,
}: {
  title: string; hint?: string; rows: RankRow[]; empty: string; asMoney?: boolean;
  reporting: string; onPick?: (row: RankRow) => void;
}) {
  if (!rows.length) return <Panel title={title}><EmptyState title={empty} /></Panel>;
  return (
    <Panel title={title} hint={hint}>
      {onPick ? (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.key}>
              <button
                onClick={() => onPick(r)}
                className="w-full flex items-center justify-between gap-3 rounded-xl px-2 py-1.5 text-[11px] hover:bg-white/5 transition"
              >
                <span className="truncate capitalize text-left">{r.label}</span>
                <span className="font-mono tabular-nums shrink-0">
                  {asMoney ? money(r.value, reporting) : compact(r.value)}
                  <span className="text-muted-foreground"> · {r.count}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <BarList
          items={rows.map((r) => ({ k: r.label, v: r.value, n: r.count }))}
          currency={reporting}
          asMoney={asMoney}
          empty={empty}
        />
      )}
    </Panel>
  );
}

function ScopeSection({
  s, reporting, onDrill,
}: { s: ScopeBreakdown; reporting: string; onDrill?: (d: BreakdownDrill) => void }) {
  if (!s.has_data) {
    return (
      <Panel title={SCOPE_LABEL[s.scope]}>
        <EmptyState
          title={s.scope === "international" ? "No international transactions yet." : "No data available"}
          hint="Every metric in this section populates automatically from real orders and payments."
        />
      </Panel>
    );
  }
  const region = ledgerRegion(s.scope);
  const drill = (d: BreakdownDrill) => onDrill?.({ region, ...d });

  return (
    <div className="space-y-4">
      <Panel title={`${SCOPE_LABEL[s.scope]} — revenue by period`} hint={`Converted to ${reporting}`}>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
          {([
            ["Today", s.periods.today],
            ["Yesterday", s.periods.yesterday],
            ["Last 7 days", s.periods.last7],
            ["Last 30 days", s.periods.last30],
            ["Month to date", s.periods.mtd],
            ["Year to date", s.periods.ytd],
          ] as const).map(([label, v]) => (
            <button key={label} onClick={() => drill({ status: "succeeded" })} className="text-left">
              <StatKpi label={label} value={v > 0 ? money(v, reporting) : "No data"} />
            </button>
          ))}
        </div>
      </Panel>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
        <button onClick={() => drill({ status: "succeeded" })} className="text-left">
          <StatKpi label="Gross revenue" value={money(s.gross_revenue, reporting)} />
        </button>
        <StatKpi label="Net revenue" value={money(s.net_revenue, reporting)} sub="revenue − refunds" />
        <StatKpi label="Shipping revenue" value={s.shipping_revenue > 0 ? money(s.shipping_revenue, reporting) : "No data"} />
        <StatKpi label="Tax collected" value={s.tax_collected > 0 ? money(s.tax_collected, reporting) : "No data"} />
        <StatKpi label="Discount given" value={s.discount_given > 0 ? money(s.discount_given, reporting) : "No data"} />
        <StatKpi label="Coupon discount" value={s.coupon_discount > 0 ? money(s.coupon_discount, reporting) : "No data"} />
        <button onClick={() => drill({ status: "refunded" })} className="text-left">
          <StatKpi label="Refund amount" tone="text-violet-300" value={money(s.refund_amount, reporting)} sub={`${s.refund_count} refund(s)`} />
        </button>
        <button onClick={() => drill({ status: "succeeded" })} className="text-left">
          <StatKpi label="Successful payments" tone="text-emerald-400" value={s.successful_payments} />
        </button>
        <button onClick={() => drill({ status: "failed" })} className="text-left">
          <StatKpi label="Failed payments" tone="text-destructive" value={s.failed_payments} />
        </button>
        <button onClick={() => drill({ status: "pending" })} className="text-left">
          <StatKpi label="Pending payments" tone="text-amber-400" value={s.pending_payments} />
        </button>
        <StatKpi label="Cancelled orders" tone="text-muted-foreground" value={s.cancelled_orders} />
        <StatKpi label="Average order value" value={money(s.aov, reporting)} />
        <StatKpi label="Success rate" tone="text-emerald-400" value={rate(s.success_rate)} />
        <StatKpi label="Orders" value={s.orders} />
        <StatKpi label="Customers" value={s.customers || "No data"} />
        {s.scope !== "india" && (
          <StatKpi label="Chargebacks" value={s.chargebacks ?? "No data"} sub="no source connected" />
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <RankPanel
          title="Gateway split" hint="Captured revenue per route" rows={s.gateway_split}
          empty="No data available" reporting={reporting}
          onPick={(r) => drill({ gateway: r.key })}
        />
        {s.scope === "india" ? (
          <RankPanel title="COD vs online" rows={s.cod_vs_online} empty="No data available" reporting={reporting} />
        ) : (
          <RankPanel
            title="Top countries" rows={s.top_countries} empty="No international transactions yet."
            reporting={reporting} onPick={(r) => drill({ country: r.key })}
          />
        )}
        <RankPanel
          title={s.scope === "india" ? "Top Indian states" : "Top states / regions"}
          rows={s.top_states} empty="No data available" reporting={reporting}
        />
        <RankPanel
          title={s.scope === "india" ? "Top Indian cities" : "Top cities"}
          rows={s.top_cities} empty="No data available" reporting={reporting}
        />
        <RankPanel title="Top categories" rows={s.top_categories} empty="No data available" reporting={reporting} />
        <RankPanel title="Top brands" rows={s.top_brands} empty="No data available" reporting={reporting} />
        <RankPanel title="Top vendors" rows={s.top_vendors} empty="No data available" reporting={reporting} />
        <RankPanel
          title="Currency breakdown" hint="Native totals — never summed together"
          rows={s.currencies} empty="No data available" reporting={reporting}
          onPick={(r) => drill({ currency: r.key })}
        />
      </div>
    </div>
  );
}

/** Payments Center v6.5 — independent India / International / Global breakdown. */
export function RegionalBreakdownPanel({
  data, onDrill,
}: { data: RegionalBreakdown; onDrill?: (d: BreakdownDrill) => void }) {
  const [scope, setScope] = useState<RegionScope>("global");
  const reporting = data.reporting_currency;
  const s = data.scopes[scope];
  const c = data.comparison;

  const shareData = useMemo(
    () => (c ? [{ k: "India", v: c.india_revenue }, { k: "International", v: c.international_revenue }].filter((r) => r.v > 0) : []),
    [c],
  );

  if (!data.has_any_data) {
    return (
      <Panel title="Regional financial breakdown">
        <EmptyState
          title="No data available"
          hint="India, international and global breakdowns appear automatically once the marketplace records its first order."
        />
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      {/* Executive dashboard */}
      <div className="grid md:grid-cols-3 gap-3">
        {(["global", "india", "international"] as RegionScope[]).map((k) => {
          const b = data.scopes[k];
          return (
            <Panel key={k} title={SCOPE_LABEL[k]} hint={b.has_data ? `${b.orders} paid order(s)` : undefined}>
              {b.has_data ? (
                <>
                  <p className="text-2xl font-semibold tabular-nums">{money(b.gross_revenue, reporting)}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    Net {money(b.net_revenue, reporting)} · Refunds {money(b.refund_amount, reporting)}
                  </p>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl border border-white/10 p-2">
                      <p className="text-[9px] uppercase tracking-widest text-muted-foreground">Orders</p>
                      <p className="text-xs font-semibold tabular-nums">{b.orders}</p>
                    </div>
                    <div className="rounded-xl border border-white/10 p-2">
                      <p className="text-[9px] uppercase tracking-widest text-muted-foreground">Customers</p>
                      <p className="text-xs font-semibold tabular-nums">{b.customers || "—"}</p>
                    </div>
                    <div className="rounded-xl border border-white/10 p-2">
                      <p className="text-[9px] uppercase tracking-widest text-muted-foreground">Success</p>
                      <p className="text-xs font-semibold tabular-nums">{rate(b.success_rate)}</p>
                    </div>
                  </div>
                </>
              ) : (
                <EmptyState
                  title={k === "international" ? "No international transactions yet." : "No data available"}
                />
              )}
            </Panel>
          );
        })}
      </div>

      <p className="text-[10px] text-muted-foreground px-1">
        <Coins className="inline size-3 mr-1 text-accent" />
        {data.rates_note}
      </p>

      {/* Regional comparison */}
      {c ? (
        <Panel title="Regional comparison" hint="India vs international — real values only">
          <div className="grid sm:grid-cols-3 gap-2.5 mb-3">
            <StatKpi label="India contributes" icon={<Scale className="size-3.5" />} value={`${(c.india_share ?? 0).toFixed(0)}%`} sub={money(c.india_revenue, reporting)} />
            <StatKpi label="International contributes" value={`${(c.international_share ?? 0).toFixed(0)}%`} sub={money(c.international_revenue, reporting)} />
            <StatKpi label="Difference" value={money(Math.abs(c.difference), reporting)} sub={c.difference >= 0 ? "India ahead" : "International ahead"} />
          </div>
          <div className="grid lg:grid-cols-[minmax(0,1fr)_260px] gap-4 items-start">
            <div className="overflow-x-auto -mx-1 px-1">
              <table className="w-full min-w-[420px] text-[11px]">
                <thead className="text-[9px] uppercase tracking-widest text-muted-foreground">
                  <tr className="border-b border-white/10 text-left">
                    <th className="py-2 pr-3">Metric</th>
                    <th className="py-2 pr-3">🇮🇳 India</th>
                    <th className="py-2">🌍 International</th>
                  </tr>
                </thead>
                <tbody>
                  {c.rows.map((r) => (
                    <tr key={r.metric} className="border-b border-white/5">
                      <td className="py-2 pr-3 text-muted-foreground">
                        {r.metric}
                        {r.note && <span className="block text-[9px] text-muted-foreground/70">{r.note}</span>}
                      </td>
                      <td className="py-2 pr-3 capitalize tabular-nums">{r.india}</td>
                      <td className="py-2 capitalize tabular-nums">{r.international}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {shareData.length > 1 && (
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={shareData} dataKey="v" nameKey="k" innerRadius={42} outerRadius={68} paddingAngle={3}>
                      {shareData.map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => money(v, reporting)} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </Panel>
      ) : (
        <Panel title="Regional comparison"><EmptyState title="No data available" /></Panel>
      )}

      {/* Monthly comparison */}
      <Panel title="Monthly comparison" hint={`India vs international · ${reporting}`}>
        {data.monthly.length ? (
          <div className="h-52 -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.monthly} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="2 6" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="month" tick={axis} tickLine={false} axisLine={false} />
                <YAxis tick={axis} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => compact(v)} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => money(v, reporting)} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="india" name="India" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="international" name="International" fill="#38bdf8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState title="No data available" />
        )}
      </Panel>

      {/* Smart insights — evidence backed only */}
      {data.insights.length > 0 && (
        <Panel title="Smart insights" hint="Derived from recorded data only">
          <ul className="space-y-2">
            {data.insights.map((i) => (
              <li key={i.id} className="flex items-start gap-2 text-[11px]">
                <Lightbulb className={`size-3.5 mt-0.5 shrink-0 ${i.tone === "bad" ? "text-destructive" : i.tone === "good" ? "text-emerald-400" : "text-accent"}`} />
                <span>{i.text}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {/* Scope switch */}
      <div className="inline-flex rounded-2xl border border-white/10 bg-white/[0.03] p-1 gap-1">
        {(["india", "international", "global"] as RegionScope[]).map((k) => (
          <button
            key={k}
            onClick={() => setScope(k)}
            className={`rounded-xl px-3 py-1.5 text-[11px] transition ${
              scope === k ? "bg-accent/15 text-accent border border-accent/30" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {SCOPE_LABEL[k]}
          </button>
        ))}
      </div>

      <ScopeSection s={s} reporting={reporting} onDrill={onDrill} />
    </div>
  );
}
