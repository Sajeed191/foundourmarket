import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle, Building2, CheckCircle2, Download, Globe2, Landmark, Loader2, Radar,
  Scale, Search, ShieldAlert, Sparkles, Timer,
} from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { SegmentedTabs } from "@/components/admin/SegmentedTabs";
import { BarList, EmptyState, Panel, StatKpi, Trend, downloadCsv, maskId, money, when } from "./ui";
import { searchFinancialAuditFn, type AuditRecord } from "@/lib/payments-recon-v8.functions";
import type {
  CountryIntel, DrillRef, GatewayTimeline, LeakageFinding, ReconDashboard,
  VendorFinance, VerificationIssue,
} from "@/lib/payments-recon-v8.functions";

/**
 * Payments Center v8.0 — Financial Reconciliation & Executive Intelligence.
 * Pure presentation of real aggregates. Every number is drillable into its
 * source records; anything without a source renders "No data available".
 */

export type ReconDrill = {
  target: "ledger";
  status?: string;
  from?: string;
  to?: string;
  country?: string;
  currency?: string;
  gateway?: string;
  region?: "all" | "india" | "international";
};

const NA = <span className="text-muted-foreground">No data available</span>;
const inr = (n: number) => money(n, "INR");
const val = (v: number | null | undefined, fmt: (n: number) => string) => (v == null ? NA : fmt(v));
const pctStr = (v: number | null | undefined) => (v == null ? NA : `${v.toFixed(1)}%`);

type Sub = "reconcile" | "verify" | "gateways" | "leakage" | "countries" | "vendors" | "audit";

const drillToLedger = (d: DrillRef | null): ReconDrill => ({
  target: "ledger",
  status: d?.ledger?.status,
  from: d?.ledger?.from,
  to: d?.ledger?.to,
  country: d?.ledger?.country,
  currency: d?.ledger?.currency,
  gateway: d?.ledger?.gateway,
});

function IssueCard({ issue, onDrill }: { issue: VerificationIssue | LeakageFinding; onDrill: (d: ReconDrill) => void }) {
  const critical = issue.severity === "critical";
  const impact = "impact" in issue ? issue.impact : null;
  return (
    <div
      className={`rounded-2xl border p-3.5 min-w-0 ${
        critical ? "border-destructive/30 bg-destructive/5" : "border-amber-500/25 bg-amber-500/5"
      }`}
    >
      <div className="flex items-start gap-2">
        <ShieldAlert className={`size-3.5 mt-0.5 shrink-0 ${critical ? "text-destructive" : "text-amber-400"}`} />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold truncate">{issue.title}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{issue.detail}</p>
          {issue.evidence.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {issue.evidence.slice(0, 5).map((e, i) => (
                <li key={i} className="text-[10px] font-mono text-muted-foreground/80 truncate">· {maskId(e)}</li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            {impact != null && (
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                Exposure {inr(impact)}
              </span>
            )}
            {issue.drill && (
              <button
                type="button"
                onClick={() => onDrill(drillToLedger(issue.drill))}
                className="rounded-full border border-white/15 px-2.5 py-1 text-[10px] hover:bg-white/5"
              >
                Open records →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function GatewayCard({ g }: { g: GatewayTimeline }) {
  const [range, setRange] = useState<"hourly" | "daily" | "weekly">("daily");
  const series = g[range];
  const hasTrend = series.some((b) => b.rate != null);
  return (
    <Panel
      title={g.gateway}
      hint={`${g.total} transaction(s) in window`}
      actions={
        <SegmentedTabs
          value={range}
          onChange={(v) => setRange(v as typeof range)}
          items={[{ value: "hourly", label: "24h" }, { value: "daily", label: "30d" }, { value: "weekly", label: "12w" }]}
        />
      }
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <StatKpi label="Success rate" value={pctStr(g.success_rate)} />
        <StatKpi label="Successful" value={String(g.success)} />
        <StatKpi label="Failed" value={String(g.failed)} />
        <StatKpi label="Pending" value={String(g.pending)} />
      </div>
      <div className="mt-3 h-40">
        {hasTrend ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="t" tick={{ fontSize: 9 }} stroke="rgba(255,255,255,0.3)" />
              <YAxis domain={[0, 100]} tick={{ fontSize: 9 }} stroke="rgba(255,255,255,0.3)" width={28} />
              <Tooltip
                contentStyle={{ background: "rgba(10,10,14,0.95)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 11 }}
                formatter={(v: number | null) => (v == null ? "No data" : `${v}%`)}
              />
              <Area type="monotone" dataKey="rate" stroke="hsl(var(--accent))" fill="hsl(var(--accent) / 0.18)" strokeWidth={2} connectNulls />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState title="No telemetry available." hint="Success-rate history appears once transactions are recorded in this range." />
        )}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-[10px] text-muted-foreground">
        <span>Timeouts: {g.timeouts ?? "No telemetry available"}</span>
        <span>Retries: {g.retries ?? "No telemetry available"}</span>
        <span>Recovery: {g.recovery_rate ?? "No telemetry available"}</span>
      </div>
    </Panel>
  );
}

function CountryBlock({ c, onDrill }: { c: CountryIntel; onDrill: (d: ReconDrill) => void }) {
  const drill = () => onDrill({ target: "ledger", country: c.code === "IN" || c.code === "INTL" ? undefined : c.code, region: c.code === "IN" ? "india" : c.code === "INTL" ? "international" : "all" });
  return (
    <Panel title={c.label} hint={`${c.orders} order(s)`}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <StatKpi label="Revenue (INR)" value={inr(c.revenue_inr)} onClick={drill} />
        <StatKpi label="Orders" value={String(c.orders)} onClick={drill} />
        <StatKpi label="Customers" value={String(c.customers)} />
        <StatKpi label="Repeat buyers" value={String(c.repeat_buyers)} />
        <StatKpi label="Refunds" value={String(c.refunds)} sub={inr(c.refund_amount)} onClick={() => onDrill({ target: "ledger", status: "refunded" })} />
        <StatKpi label="Tax" value={inr(c.tax)} />
        <StatKpi label="Average order" value={val(c.avg_order, inr)} />
        <StatKpi label="Growth vs previous" value={c.growth == null ? NA : <Trend delta={c.growth} />} />
      </div>
      <div className="mt-3 grid md:grid-cols-3 gap-3">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-2">Currencies</p>
          <BarList items={c.currencies} empty="No data available" />
        </div>
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-2">Top cities</p>
          <BarList items={c.top_cities} empty="No data available" />
        </div>
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-2">Top states</p>
          <BarList items={c.top_states} empty="No data available" />
        </div>
      </div>
      <p className="mt-3 text-[10px] text-muted-foreground">
        Conversion: {c.conversion == null ? "No data available (no per-country session source)" : `${c.conversion}%`}
      </p>
    </Panel>
  );
}

function AuditExplorer({ onDrill }: { onDrill: (d: ReconDrill) => void }) {
  const searchFn = useServerFn(searchFinancialAuditFn);
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [gateway, setGateway] = useState("");
  const [currency, setCurrency] = useState("");
  const [country, setCountry] = useState("");
  const [rows, setRows] = useState<AuditRecord[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    try {
      const res = await searchFn({
        data: {
          query: query || undefined,
          from: from || undefined,
          to: to || undefined,
          gateway: gateway || undefined,
          currency: currency || undefined,
          country: country || undefined,
        },
      });
      setRows(res.records);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [searchFn, query, from, to, gateway, currency, country]);

  const field = "bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 text-[11px] focus:outline-none focus:border-accent/40 w-full";

  return (
    <Panel title="Financial audit explorer" hint="Order · payment · refund · email · vendor · gateway · country · currency · date">
      <div className="grid sm:grid-cols-3 gap-2">
        <input className={`${field} sm:col-span-3`} placeholder="Order ID, payment ID, refund ID, customer email or gateway reference" value={query} onChange={(e) => setQuery(e.target.value)} />
        <input className={field} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input className={field} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <input className={field} placeholder="Gateway" value={gateway} onChange={(e) => setGateway(e.target.value)} />
        <input className={field} placeholder="Currency (e.g. INR)" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
        <input className={field} placeholder="Country code (e.g. IN)" value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} />
        <button onClick={run} className="rounded-xl border border-white/15 px-3 py-2 text-[11px] hover:bg-white/5 inline-flex items-center justify-center gap-1.5">
          {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />} Search
        </button>
      </div>

      <div className="mt-3">
        {rows == null && <EmptyState title="Search to trace a financial record." hint="Every result shows creation, updates, payments, refunds, settlement, admin actions and security events." />}
        {rows != null && rows.length === 0 && <EmptyState title="No data available" hint="No records match this search." />}
        {rows != null && rows.length > 0 && (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.id} className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
                <button type="button" onClick={() => setOpen(open === r.id ? null : r.id)} className="w-full text-left min-w-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-mono text-[11px] truncate">{maskId(r.id)}</span>
                    <span className="font-mono text-[11px] tabular-nums shrink-0">{money(r.amount, r.currency)}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 flex-wrap text-[10px] text-muted-foreground">
                    <span className="uppercase tracking-widest">{r.status}</span>
                    <span>· {when(r.created_at)}</span>
                    {r.gateway && <span>· {r.gateway}</span>}
                    {r.country && <span>· {r.country}</span>}
                  </div>
                </button>
                {open === r.id && (
                  <div className="mt-2 border-t border-white/5 pt-2">
                    <ol className="space-y-1.5">
                      {r.timeline.map((t, i) => (
                        <li key={i} className="flex items-baseline gap-2 text-[11px] min-w-0">
                          <span className="size-1.5 rounded-full bg-accent/70 shrink-0" />
                          <span className="truncate">{t.label}</span>
                          {t.detail && <span className="text-muted-foreground truncate">· {t.detail}</span>}
                          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{when(t.at)}</span>
                        </li>
                      ))}
                    </ol>
                    <button
                      type="button"
                      onClick={() => onDrill({ target: "ledger", from: r.created_at.slice(0, 10), to: r.created_at.slice(0, 10) })}
                      className="mt-2 rounded-full border border-white/15 px-2.5 py-1 text-[10px] hover:bg-white/5"
                    >
                      Open in ledger →
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}

export function ReconciliationPanel({
  data, onDrill, onAuditExport,
}: {
  data: ReconDashboard;
  onDrill: (d: ReconDrill) => void;
  onAuditExport?: (report: string) => void;
}) {
  const [sub, setSub] = useState<Sub>("reconcile");
  const r = data.reconciliation;
  const v = data.revenue;

  const exportCsv = useCallback((name: string, headers: string[], rows: (string | number)[][]) => {
    downloadCsv(`foundourmarket-${name}-${new Date().toISOString().slice(0, 10)}`, headers, rows);
    onAuditExport?.(name);
  }, [onAuditExport]);

  const vendors: VendorFinance[] = useMemo(() => data.vendors, [data.vendors]);

  return (
    <div className="space-y-4">
      {data.insight && (
        <Panel title="Executive insight" hint="One prioritised, evidence-backed recommendation">
          <div className="flex items-start gap-3">
            <Sparkles className="size-4 text-accent mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold">{data.insight.headline}</p>
              <ul className="mt-1.5 space-y-0.5">
                {data.insight.evidence.map((e, i) => (
                  <li key={i} className="text-[11px] text-muted-foreground truncate">· {e}</li>
                ))}
              </ul>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Impact: {data.insight.impact} · Confidence: {data.insight.confidence}
              </p>
              {data.insight.drill && (
                <button
                  type="button"
                  onClick={() => onDrill(drillToLedger(data.insight!.drill))}
                  className="mt-2 rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 text-[11px] hover:bg-accent/20"
                >
                  {data.insight.action_label} →
                </button>
              )}
            </div>
          </div>
        </Panel>
      )}

      <SegmentedTabs
        value={sub}
        onChange={(s) => setSub(s as Sub)}
        items={[
          { value: "reconcile", label: "Reconciliation", icon: <Scale className="size-3" /> },
          { value: "verify", label: "Verification", icon: <CheckCircle2 className="size-3" /> },
          { value: "gateways", label: "Gateways", icon: <Timer className="size-3" /> },
          { value: "leakage", label: "Leakage", icon: <Radar className="size-3" /> },
          { value: "countries", label: "Countries", icon: <Globe2 className="size-3" /> },
          { value: "vendors", label: "Vendors", icon: <Building2 className="size-3" /> },
          { value: "audit", label: "Audit", icon: <Search className="size-3" /> },
        ]}
      />

      {sub === "reconcile" && (
        <div className="space-y-4">
          <Panel
            title="Financial reconciliation center"
            hint={`Last ${data.window_days} days · every figure traceable to database records`}
            actions={
              <button
                onClick={() => exportCsv("reconciliation", ["Metric", "Count"], [
                  ["Orders created", r.orders_created], ["Payments received", r.payments_received],
                  ["Successful payments", r.successful_payments], ["Failed payments", r.failed_payments],
                  ["Refunded payments", r.refunded_payments], ["Cancelled orders", r.cancelled_orders],
                  ["Pending orders", r.pending_orders],
                ])}
                className="rounded-xl border border-white/10 px-2.5 py-1.5 text-[10px] hover:bg-white/5 inline-flex items-center gap-1.5"
              >
                <Download className="size-3" /> Export
              </button>
            }
          >
            {!r.has_data ? (
              <EmptyState title="No data available" hint="Reconciliation figures appear once the marketplace records its first order or payment." />
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <StatKpi label="Orders created" value={String(r.orders_created)} onClick={() => onDrill({ target: "ledger" })} />
                  <StatKpi label="Payments received" value={String(r.payments_received)} onClick={() => onDrill({ target: "ledger" })} />
                  <StatKpi label="Successful payments" value={String(r.successful_payments)} onClick={() => onDrill({ target: "ledger", status: "succeeded" })} />
                  <StatKpi label="Failed payments" value={String(r.failed_payments)} onClick={() => onDrill({ target: "ledger", status: "failed" })} />
                  <StatKpi label="Refunded payments" value={String(r.refunded_payments)} onClick={() => onDrill({ target: "ledger", status: "refunded" })} />
                  <StatKpi label="Cancelled orders" value={String(r.cancelled_orders)} onClick={() => onDrill({ target: "ledger", status: "cancelled" })} />
                  <StatKpi label="Pending orders" value={String(r.pending_orders)} onClick={() => onDrill({ target: "ledger", status: "pending" })} />
                </div>

                <div className="mt-4">
                  <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-2">Mismatches</p>
                  {r.mismatches.length === 0 ? (
                    <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-3.5 flex items-start gap-2">
                      <CheckCircle2 className="size-3.5 text-emerald-400 mt-0.5" />
                      <p className="text-[11px]">Everything reconciles — no discrepancies found between orders, payments and refunds.</p>
                    </div>
                  ) : (
                    <ul className="space-y-2">
                      {r.mismatches.map((m) => (
                        <li key={m.id} className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-3.5 min-w-0">
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="size-3.5 text-amber-400 mt-0.5 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-[12px] font-semibold truncate">{m.label}</p>
                              <p className="mt-0.5 text-[11px] text-muted-foreground">{m.detail}</p>
                              <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                                expected {m.expected} · actual {m.actual} · difference {m.difference > 0 ? "+" : ""}{m.difference}
                              </p>
                              {m.drill && (
                                <button
                                  type="button"
                                  onClick={() => onDrill(drillToLedger(m.drill))}
                                  className="mt-2 rounded-full border border-white/15 px-2.5 py-1 text-[10px] hover:bg-white/5"
                                >
                                  Open mismatched records →
                                </button>
                              )}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </Panel>
        </div>
      )}

      {sub === "verify" && (
        <div className="space-y-4">
          <Panel title="Revenue verification" hint="Products + shipping + tax − discounts − coupons">
            {!v.has_data ? (
              <EmptyState title="No data available" />
            ) : (
              <>
                <div className={`rounded-2xl border p-3 mb-3 inline-flex items-center gap-2 text-[11px] ${
                  v.verified ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-amber-500/30 bg-amber-500/10 text-amber-300"
                }`}>
                  {v.verified ? <CheckCircle2 className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
                  {v.verified ? "Verified" : "Needs review"}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <StatKpi label="Products" value={inr(v.products)} onClick={() => onDrill({ target: "ledger", status: "succeeded" })} />
                  <StatKpi label="Shipping" value={inr(v.shipping)} />
                  <StatKpi label="Tax" value={inr(v.tax)} />
                  <StatKpi label="Discounts" value={inr(v.discounts)} />
                  <StatKpi label="Coupons" value={inr(v.coupons)} />
                  <StatKpi label="Computed revenue" value={inr(v.computed)} />
                  <StatKpi label="Recorded revenue" value={inr(v.recorded)} />
                  <StatKpi label="Variance" value={inr(v.variance)} sub={`tolerance ${inr(v.tolerance)}`} />
                </div>
                <p className="mt-2 font-mono text-[10px] text-muted-foreground">
                  {inr(v.products)} + {inr(v.shipping)} + {inr(v.tax)} − {inr(v.discounts)} = {inr(v.computed)} · recorded {inr(v.recorded)}
                </p>
                {v.offenders.length > 0 && (
                  <div className="mt-3">
                    <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-2">
                      Orders whose total does not match their components
                    </p>
                    <ul className="space-y-1">
                      {v.offenders.slice(0, 10).map((o) => (
                        <li key={o.order_id} className="flex items-baseline justify-between gap-3 text-[11px]">
                          <span className="font-mono truncate">{maskId(o.order_id)}</span>
                          <span className="font-mono tabular-nums shrink-0">
                            recorded {inr(o.recorded)} · computed {inr(o.computed)} · Δ {inr(o.variance)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </Panel>

          <Panel title="Refund verification" hint="Only real, evidence-backed issues are shown">
            {data.refund_issues.length === 0 ? (
              <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-3.5 flex items-start gap-2">
                <CheckCircle2 className="size-3.5 text-emerald-400 mt-0.5" />
                <p className="text-[11px]">No refund integrity issues detected.</p>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-2.5">
                {data.refund_issues.map((i) => <IssueCard key={i.id} issue={i} onDrill={onDrill} />)}
              </div>
            )}
          </Panel>

          <Panel title="Settlement verification" hint="Payment → settlement → vendor payout → platform commission">
            {!data.settlement.available ? (
              <EmptyState title="No settlement integration available." />
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <StatKpi label="Payments captured" value={val(data.settlement.payments_total, inr)} icon={<Landmark className="size-3" />} />
                  <StatKpi label="Settlements" value={data.settlement.settlements_total == null ? NA : inr(data.settlement.settlements_total)} />
                  <StatKpi label="Vendor payouts" value={val(data.settlement.vendor_payout_total, inr)} />
                  <StatKpi label="Platform commission" value={val(data.settlement.platform_commission_total, inr)} />
                </div>
                {data.settlement.missing_links.length > 0 && (
                  <div className="mt-3 grid md:grid-cols-2 gap-2.5">
                    {data.settlement.missing_links.map((i) => <IssueCard key={i.id} issue={i} onDrill={onDrill} />)}
                  </div>
                )}
              </>
            )}
          </Panel>
        </div>
      )}

      {sub === "gateways" && (
        <div className="space-y-4">
          {data.gateways.length === 0
            ? <Panel title="Gateway health timeline"><EmptyState title="No telemetry available." /></Panel>
            : data.gateways.map((g) => <GatewayCard key={g.gateway} g={g} />)}
        </div>
      )}

      {sub === "leakage" && (
        <Panel
          title="Revenue leakage detector"
          hint="Evidence-backed findings only"
          actions={data.leakage.length > 0 ? (
            <button
              onClick={() => exportCsv("revenue-leakage", ["Finding", "Severity", "Detail", "Exposure"],
                data.leakage.map((l) => [l.title, l.severity, l.detail, l.impact ?? ""]))}
              className="rounded-xl border border-white/10 px-2.5 py-1.5 text-[10px] hover:bg-white/5 inline-flex items-center gap-1.5"
            >
              <Download className="size-3" /> Export
            </button>
          ) : undefined}
        >
          {data.leakage.length === 0 ? (
            <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-3.5 flex items-start gap-2">
              <CheckCircle2 className="size-3.5 text-emerald-400 mt-0.5" />
              <p className="text-[11px]">No revenue leakage detected from the current records.</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-2.5">
              {data.leakage.map((l) => <IssueCard key={l.id} issue={l} onDrill={onDrill} />)}
            </div>
          )}
        </Panel>
      )}

      {sub === "countries" && (
        <div className="space-y-4">
          {!data.countries.india && !data.countries.international && data.countries.by_country.length === 0 ? (
            <Panel title="Country intelligence"><EmptyState title="No data available" /></Panel>
          ) : (
            <>
              {data.countries.india && <CountryBlock c={data.countries.india} onDrill={onDrill} />}
              {data.countries.international && <CountryBlock c={data.countries.international} onDrill={onDrill} />}
              {data.countries.by_country.length > 0 && (
                <Panel title="Top countries" hint="Revenue converted at indicative reference rates">
                  <BarList items={data.countries.by_country.map((c) => ({ k: c.label, v: c.revenue_inr, n: c.orders }))} />
                </Panel>
              )}
            </>
          )}
        </div>
      )}

      {sub === "vendors" && (
        <Panel
          title="Vendor finance intelligence"
          hint="Ranked by revenue · real records only"
          actions={vendors.length > 0 ? (
            <button
              onClick={() => exportCsv("vendor-finance",
                ["Rank", "Vendor", "Revenue", "Orders", "Refunds", "Cancelled", "Avg order", "Growth %", "Commission", "Payout", "Pending", "Risk"],
                vendors.map((v2) => [v2.rank, v2.name, v2.revenue, v2.orders, v2.refunds, v2.cancelled, v2.avg_order ?? "", v2.growth ?? "", v2.commission ?? "", v2.payout ?? "", v2.pending ?? "", v2.risk_score ?? ""]))}
              className="rounded-xl border border-white/10 px-2.5 py-1.5 text-[10px] hover:bg-white/5 inline-flex items-center gap-1.5"
            >
              <Download className="size-3" /> Export
            </button>
          ) : undefined}
        >
          {vendors.length === 0 ? (
            <EmptyState title="No data available" hint="Vendor finance appears once vendors are registered and orders are attributed." />
          ) : (
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-[9px] font-mono uppercase tracking-[0.15em] text-muted-foreground">
                    {["#", "Vendor", "Revenue", "Orders", "Refunds", "Cancelled", "Avg", "Growth", "Commission", "Payout", "Pending", "Risk"].map((h) => (
                      <th key={h} className="text-left font-normal py-2 pr-3 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {vendors.map((v2) => (
                    <tr key={v2.vendor_id} className="border-t border-white/5">
                      <td className="py-2 pr-3 tabular-nums">{v2.rank}</td>
                      <td className="py-2 pr-3 truncate max-w-[160px]">{v2.name}</td>
                      <td className="py-2 pr-3 font-mono tabular-nums">{inr(v2.revenue)}</td>
                      <td className="py-2 pr-3 tabular-nums">{v2.orders}</td>
                      <td className="py-2 pr-3 tabular-nums">{v2.refunds}</td>
                      <td className="py-2 pr-3 tabular-nums">{v2.cancelled}</td>
                      <td className="py-2 pr-3 font-mono tabular-nums">{v2.avg_order == null ? "—" : inr(v2.avg_order)}</td>
                      <td className="py-2 pr-3">{v2.growth == null ? "—" : <Trend delta={v2.growth} />}</td>
                      <td className="py-2 pr-3 font-mono tabular-nums">{v2.commission == null ? "—" : inr(v2.commission)}</td>
                      <td className="py-2 pr-3 font-mono tabular-nums">{v2.payout == null ? "—" : inr(v2.payout)}</td>
                      <td className="py-2 pr-3 font-mono tabular-nums">{v2.pending == null ? "—" : inr(v2.pending)}</td>
                      <td className="py-2 pr-3 tabular-nums" title={v2.risk_reason}>{v2.risk_score == null ? "—" : v2.risk_score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {sub === "audit" && <AuditExplorer onDrill={onDrill} />}

      <p className="text-[10px] text-muted-foreground">
        Generated {when(data.generated_at)} · window {data.window_days} days · reporting currency {data.currency}.
        Cross-currency figures use indicative reference rates and are labelled as such.
      </p>
    </div>
  );
}
