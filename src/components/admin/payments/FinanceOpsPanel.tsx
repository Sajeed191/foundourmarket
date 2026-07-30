/**
 * Payments Center v5 — Finance Operations Hub (admin UI).
 *
 * Presentation only: every number below comes from `getFinanceOpsFn`.
 * Modules without a data source render a premium empty state instead of
 * fabricated analytics.
 */
import { useCallback, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  AlarmClock, Activity, CalendarDays, CheckCircle2, Clock, Download, Flag, Gauge,
  Globe2, Search, Sparkles, TriangleAlert, X,
} from "lucide-react";
import type {
  FinanceOps, OpsAction, OpsCard, QueueItem, FinanceSearchHit,
} from "@/lib/payments-ops-v5.functions";
import { recordFinanceActionFn, searchFinanceFn } from "@/lib/payments-ops-v5.functions";
import { EmptyState, Panel, StatKpi, money, when, ago, downloadCsv, downloadExcel } from "./ui";

const TONE: Record<string, string> = {
  bad: "border-destructive/30 bg-destructive/[0.07]",
  warn: "border-amber-500/30 bg-amber-500/[0.07]",
  info: "border-sky-500/25 bg-sky-500/[0.06]",
  good: "border-emerald-500/25 bg-emerald-500/[0.06]",
};

const PRIORITY: Record<QueueItem["priority"], string> = {
  critical: "text-destructive border-destructive/30 bg-destructive/10",
  high: "text-amber-400 border-amber-500/30 bg-amber-500/10",
  medium: "text-sky-400 border-sky-500/30 bg-sky-500/10",
  low: "text-muted-foreground border-white/10 bg-white/5",
};

export function FinanceOpsPanel({
  data,
  onAction,
  onOpenPayment,
}: {
  data: FinanceOps;
  onAction: (a: OpsAction) => void;
  onOpenPayment: (paymentId: string) => void;
}) {
  const record = useServerFn(recordFinanceActionFn);
  const [reviewed, setReviewed] = useState<string[]>([]);
  const [archived, setArchived] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);

  const audited = useCallback(
    (kind: "export" | "mark_reviewed" | "archive_alert", entityId?: string, dataset?: string, rows?: number) => {
      record({ data: { kind, entityId: entityId ?? null, dataset: dataset ?? null, rows: rows ?? null } }).catch(() => {});
    },
    [record],
  );

  const cur = data.currency;
  const alerts = data.alerts.filter((a) => !archived.includes(a.id));
  const queue = data.queue;

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const exportQueue = (fmt: "csv" | "xls") => {
    const rows = (selected.length ? queue.filter((q) => selected.includes(q.id)) : queue).map((q) => [
      q.priority, q.title, q.reason, q.orders, q.impact, q.recommendation, `${Math.round(q.confidence * 100)}%`,
    ]);
    const headers = ["Priority", "Item", "Reason", "Orders", "Impact", "Recommended action", "Confidence"];
    if (fmt === "csv") downloadCsv("finance-action-queue", headers, rows);
    else downloadExcel("finance-action-queue", headers, rows);
    audited("export", null ?? undefined, "action_queue", rows.length);
  };

  if (!data.has_any_data) {
    return (
      <Panel title="Finance operations">
        <EmptyState
          title="No finance activity yet."
          hint="The operations board, action queue, timeline and alerts populate automatically from live payments, refunds and admin activity."
        />
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <FinanceSearch onOpenPayment={onOpenPayment} />

      {/* 8 — Daily finance digest */}
      <Panel title="Daily finance digest" hint={`Today · ${data.digest.date}`}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <StatKpi label="Revenue today" value={money(data.digest.revenue, cur)} icon={<Activity className="size-3" />} />
          <StatKpi label="Paid orders today" value={data.digest.orders} icon={<CheckCircle2 className="size-3" />} />
          <StatKpi
            label="Largest order"
            value={data.digest.largest_order ? money(data.digest.largest_order.value, cur) : "—"}
            sub={data.digest.largest_order?.label ?? "No data available"}
          />
          <StatKpi
            label="Highest refund"
            value={data.digest.highest_refund ? money(data.digest.highest_refund.value, cur) : "—"}
            sub={data.digest.highest_refund?.label ?? "No data available"}
          />
          <StatKpi
            label="Fastest gateway"
            value={data.digest.fastest_gateway ? data.digest.fastest_gateway.provider : "—"}
            sub={data.digest.fastest_gateway ? `${data.digest.fastest_gateway.minutes.toFixed(1)} min to capture` : "No data available"}
          />
          <StatKpi
            label="Most-used method"
            value={data.digest.top_method ? data.digest.top_method.method : "—"}
            sub={data.digest.top_method ? `${data.digest.top_method.share.toFixed(0)}% of captures` : "No data available"}
          />
          <StatKpi
            label="Best country"
            value={data.digest.best_country ? data.digest.best_country.country : "—"}
            sub={data.digest.best_country ? money(data.digest.best_country.revenue, cur) : "No data available"}
          />
          <StatKpi
            label="Top issue"
            value={<span className="text-[13px] leading-tight">{data.digest.worst_issue ?? "Nothing needs attention"}</span>}
          />
        </div>
      </Panel>

      {/* 5 — Payment alerts */}
      {alerts.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-2.5">
          {alerts.map((a) => (
            <div key={a.id} className={`rounded-2xl border p-3.5 ${TONE[a.severity]}`}>
              <div className="flex items-start gap-2">
                <TriangleAlert className={`size-4 mt-0.5 ${a.severity === "bad" ? "text-destructive" : "text-amber-400"}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold">{a.title}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{a.detail}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <button onClick={() => onAction(a.action)} className="text-[10px] font-mono uppercase tracking-widest text-accent hover:underline">
                      Investigate
                    </button>
                    <button
                      onClick={() => { setArchived((x) => [...x, a.id]); audited("archive_alert", a.id, "alert"); }}
                      className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground"
                    >
                      Archive
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 1 — Finance operations home */}
      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-2.5">
        <BoardColumn title="Needs attention" icon={<TriangleAlert className="size-3" />} cards={data.board.needs_attention} cur={cur} onAction={onAction} empty="Nothing blocked right now." />
        <BoardColumn title="In progress" icon={<Clock className="size-3" />} cards={data.board.in_progress} cur={cur} onAction={onAction} empty="No payments in flight." />
        <BoardColumn title="Completed today" icon={<CheckCircle2 className="size-3" />} cards={data.board.completed_today} cur={cur} onAction={onAction} empty="No completed finance activity today." />
        <BoardColumn title="Upcoming" icon={<AlarmClock className="size-3" />} cards={data.board.upcoming} cur={cur} onAction={onAction} empty="Nothing scheduled." />
      </div>

      {/* 2 + 11 — Smart finance queue with safe bulk operations */}
      <Panel
        title="Smart finance queue"
        hint={selected.length ? `${selected.length} selected` : "Prioritised by impact and urgency"}
        actions={
          <div className="flex items-center gap-1.5">
            <button onClick={() => exportQueue("csv")} className="rounded-lg border border-white/10 px-2 py-1 text-[10px] font-mono uppercase tracking-widest hover:bg-white/5">CSV</button>
            <button onClick={() => exportQueue("xls")} className="rounded-lg border border-white/10 px-2 py-1 text-[10px] font-mono uppercase tracking-widest hover:bg-white/5">Excel</button>
            {selected.length > 0 && (
              <button
                onClick={() => { setReviewed((r) => [...new Set([...r, ...selected])]); selected.forEach((id) => audited("mark_reviewed", id, "queue_item")); setSelected([]); }}
                className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 px-2 py-1 text-[10px] font-mono uppercase tracking-widest"
              >
                Mark reviewed
              </button>
            )}
          </div>
        }
      >
        {queue.length === 0 ? (
          <EmptyState title="The finance queue is clear." hint="Refund backlogs, failure spikes and stuck payments appear here the moment they occur." />
        ) : (
          <ul className="space-y-2">
            {queue.map((q) => (
              <li
                key={q.id}
                className={`rounded-xl border border-white/10 bg-white/[0.02] p-3 ${reviewed.includes(q.id) ? "opacity-60" : ""}`}
              >
                <div className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={selected.includes(q.id)}
                    onChange={() => toggle(q.id)}
                    className="mt-1 size-3.5 accent-current"
                    aria-label={`Select ${q.title}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[9px] font-mono uppercase tracking-[0.15em] ${PRIORITY[q.priority]}`}>
                        {q.priority}
                      </span>
                      <p className="text-xs font-semibold truncate">{q.title}</p>
                      {reviewed.includes(q.id) && <Flag className="size-3 text-emerald-400" />}
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">{q.reason}</p>
                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-mono text-muted-foreground">
                      <span>{q.orders} order{q.orders === 1 ? "" : "s"}</span>
                      <span>impact {money(q.impact, q.currency)}</span>
                      <span>confidence {Math.round(q.confidence * 100)}%</span>
                    </div>
                    <p className="mt-1.5 text-[11px]"><span className="text-accent">Recommended:</span> {q.recommendation}</p>
                    <button
                      onClick={() => (q.target_payment_id ? onOpenPayment(q.target_payment_id) : onAction(q.action))}
                      className="mt-2 rounded-lg border border-accent/30 bg-accent/10 px-2.5 py-1 text-[10px] font-mono uppercase tracking-widest text-accent"
                    >
                      Open
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* 6 — Gateway comparison */}
      <Panel title="Gateway comparison" hint="Measured from recorded payment attempts">
        {data.gateways.length === 0 ? (
          <EmptyState title="No gateway activity recorded." />
        ) : (
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full min-w-[720px] text-[11px]">
              <thead>
                <tr className="text-[9px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
                  {["Gateway", "Revenue", "Orders", "Success", "Failure", "Refund", "Latency", "Avg processing", "Availability"].map((h) => (
                    <th key={h} className="text-left font-normal pb-2 pr-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.gateways.map((g) => (
                  <tr key={g.provider} className="border-t border-white/5">
                    <td className="py-2 pr-3 capitalize font-medium">{g.provider}</td>
                    <td className="py-2 pr-3 font-mono tabular-nums">{money(g.revenue, cur)}</td>
                    <td className="py-2 pr-3 font-mono tabular-nums">{g.orders}</td>
                    <td className="py-2 pr-3 font-mono tabular-nums text-emerald-400">{g.success_rate == null ? "—" : `${g.success_rate.toFixed(1)}%`}</td>
                    <td className="py-2 pr-3 font-mono tabular-nums text-destructive">{g.failure_rate == null ? "—" : `${g.failure_rate.toFixed(1)}%`}</td>
                    <td className="py-2 pr-3 font-mono tabular-nums">{g.refund_rate == null ? "—" : `${g.refund_rate.toFixed(1)}%`}</td>
                    <td className="py-2 pr-3 text-muted-foreground">no telemetry</td>
                    <td className="py-2 pr-3 font-mono tabular-nums">{g.avg_processing_minutes == null ? "—" : `${g.avg_processing_minutes.toFixed(1)} min`}</td>
                    <td className="py-2 pr-3 font-mono tabular-nums">{g.availability == null ? "—" : `${g.availability.toFixed(1)}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* 7 — Country performance */}
      <Panel
        title="Country performance"
        hint="Ranked by captured revenue"
        actions={
          data.countries.length > 0 ? (
            <button
              onClick={() => {
                downloadCsv("country-performance",
                  ["Country", "Revenue", "Orders", "AOV", "Refund %", "Failure %", "Growth %"],
                  data.countries.map((c) => [c.country, c.revenue, c.orders, c.aov.toFixed(2),
                    c.refund_rate?.toFixed(1) ?? "", c.failure_rate?.toFixed(1) ?? "", c.growth?.toFixed(1) ?? ""]));
                audited("export", null ?? undefined, "country_performance", data.countries.length);
              }}
              className="rounded-lg border border-white/10 px-2 py-1 text-[10px] font-mono uppercase tracking-widest hover:bg-white/5"
            >
              <Download className="size-3 inline mr-1" />CSV
            </button>
          ) : undefined
        }
      >
        {data.countries.length === 0 ? (
          <EmptyState title="No country-level revenue recorded." />
        ) : (
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full min-w-[620px] text-[11px]">
              <thead>
                <tr className="text-[9px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
                  {["Country", "Revenue", "Orders", "Avg order", "Refund %", "Failure %", "Growth"].map((h) => (
                    <th key={h} className="text-left font-normal pb-2 pr-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.countries.map((c) => (
                  <tr key={c.country} className="border-t border-white/5">
                    <td className="py-2 pr-3 flex items-center gap-1.5"><Globe2 className="size-3 text-muted-foreground" />{c.country}</td>
                    <td className="py-2 pr-3 font-mono tabular-nums">{money(c.revenue, cur)}</td>
                    <td className="py-2 pr-3 font-mono tabular-nums">{c.orders}</td>
                    <td className="py-2 pr-3 font-mono tabular-nums">{money(c.aov, cur)}</td>
                    <td className="py-2 pr-3 font-mono tabular-nums">{c.refund_rate == null ? "—" : `${c.refund_rate.toFixed(1)}%`}</td>
                    <td className="py-2 pr-3 font-mono tabular-nums">{c.failure_rate == null ? "—" : `${c.failure_rate.toFixed(1)}%`}</td>
                    <td className={`py-2 pr-3 font-mono tabular-nums ${(c.growth ?? 0) >= 0 ? "text-emerald-400" : "text-destructive"}`}>
                      {c.growth == null ? "—" : `${c.growth.toFixed(1)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* 4 — Settlement calendar */}
      <Panel title="Settlement calendar" hint="Upcoming · completed · delayed">
        {!data.calendar.available ? (
          <EmptyState title="Settlement calendar unavailable." hint={data.calendar.reason} />
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-7 gap-1.5">
            {data.calendar.days.map((d) => (
              <div key={d.date} className="rounded-xl border border-white/10 bg-white/[0.02] p-2">
                <p className="text-[9px] font-mono text-muted-foreground">{d.date.slice(5)}</p>
                <p className="mt-1 text-[11px] font-mono tabular-nums">{money(d.completed_value, cur)}</p>
                <p className="text-[9px] text-muted-foreground">{d.completed} settled{d.delayed ? ` · ${d.delayed} delayed` : ""}</p>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* 3 — Financial timeline */}
      <FinanceTimeline data={data} onOpenPayment={onOpenPayment} />

      {/* 9 — Export center */}
      <Panel title="Export center" hint="Every export is recorded in the admin audit log">
        {data.exports.length === 0 ? (
          <EmptyState title="No exports generated yet." hint="Exports you download from the Payments Center are logged here with the filters used." />
        ) : (
          <ul className="divide-y divide-white/5">
            {data.exports.map((e) => (
              <li key={e.id} className="py-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium capitalize truncate">{e.dataset}</p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {e.actor ?? "Staff"} · {when(e.at)}{e.rows != null ? ` · ${e.rows} rows` : ""}
                  </p>
                  {e.filters && <p className="text-[9px] font-mono text-muted-foreground/70 truncate">{e.filters}</p>}
                </div>
                <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground shrink-0">{ago(e.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function BoardColumn({
  title, icon, cards, cur, onAction, empty,
}: {
  title: string; icon: React.ReactNode; cards: OpsCard[]; cur: string;
  onAction: (a: OpsAction) => void; empty: string;
}) {
  return (
    <section className="glass border border-white/10 rounded-2xl p-3 min-w-0">
      <h3 className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
        {icon}{title}
      </h3>
      {cards.length === 0 ? (
        <p className="mt-3 text-[11px] text-muted-foreground/70">{empty}</p>
      ) : (
        <ul className="mt-2.5 space-y-2">
          {cards.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => onAction(c.action)}
                className={`w-full text-left rounded-xl border p-2.5 transition hover:brightness-125 ${TONE[c.tone]}`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] font-medium truncate">{c.title}</span>
                  <span className="text-sm font-semibold tabular-nums shrink-0">{c.count}</span>
                </div>
                {c.value != null && <p className="text-[10px] font-mono tabular-nums text-muted-foreground">{money(c.value, cur)}</p>}
                <p className="mt-1 text-[10px] text-muted-foreground/80">{c.hint}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const KINDS = ["all", "payment", "refund", "settlement", "export", "gateway", "admin"] as const;

function FinanceTimeline({ data, onOpenPayment }: { data: FinanceOps; onOpenPayment: (id: string) => void }) {
  const [kind, setKind] = useState<(typeof KINDS)[number]>("all");
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.timeline.filter(
      (e) => (kind === "all" || e.kind === kind) &&
        (!needle || `${e.title} ${e.detail ?? ""}`.toLowerCase().includes(needle)),
    ).slice(0, 120);
  }, [data.timeline, kind, q]);

  return (
    <Panel
      title="Financial timeline"
      hint="Payments · refunds · exports · admin actions"
      actions={
        <div className="flex items-center gap-1.5">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter"
            className="w-24 sm:w-36 bg-white/[0.03] border border-white/10 rounded-lg px-2 py-1 text-[11px] focus:outline-none focus:border-accent/40"
          />
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as (typeof KINDS)[number])}
            className="bg-white/[0.03] border border-white/10 rounded-lg px-2 py-1 text-[11px] focus:outline-none focus:border-accent/40"
          >
            {KINDS.map((k) => <option key={k} value={k} className="bg-background">{k}</option>)}
          </select>
        </div>
      }
    >
      {rows.length === 0 ? (
        <EmptyState title="No timeline events match." />
      ) : (
        <ul className="relative space-y-2 before:absolute before:left-[5px] before:top-1 before:bottom-1 before:w-px before:bg-white/10">
          {rows.map((e) => (
            <li key={e.id} className="relative pl-5">
              <span className={`absolute left-0 top-1.5 size-2.5 rounded-full border ${
                e.tone === "good" ? "bg-emerald-400/70 border-emerald-300/40"
                : e.tone === "bad" ? "bg-destructive/70 border-destructive/40"
                : e.tone === "warn" ? "bg-amber-400/70 border-amber-300/40"
                : "bg-sky-400/60 border-sky-300/40"}`} />
              <div className="flex items-baseline justify-between gap-3">
                <button
                  disabled={!e.payment_id}
                  onClick={() => e.payment_id && onOpenPayment(e.payment_id)}
                  className={`text-[11px] truncate text-left ${e.payment_id ? "hover:text-accent" : "cursor-default"}`}
                >
                  <span className="capitalize font-medium">{e.title}</span>
                  {e.detail && <span className="text-muted-foreground"> · {e.detail}</span>}
                </button>
                <span className="text-[10px] font-mono tabular-nums text-muted-foreground shrink-0">
                  {e.amount ? money(e.amount, e.currency) : ""} {ago(e.at)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function FinanceSearch({ onOpenPayment }: { onOpenPayment: (id: string) => void }) {
  const searchFn = useServerFn(searchFinanceFn);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<FinanceSearchHit[] | null>(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async (value: string) => {
      if (value.trim().length < 2) { setHits(null); return; }
      setBusy(true);
      try { setHits(await searchFn({ data: { q: value } })); }
      catch { setHits([]); }
      finally { setBusy(false); }
    },
    [searchFn],
  );

  return (
    <div className="glass border border-white/10 rounded-2xl p-2.5">
      <form
        onSubmit={(e) => { e.preventDefault(); run(q); }}
        className="flex items-center gap-2"
      >
        <Search className="size-3.5 text-muted-foreground shrink-0" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search orders, payments, refunds, customers…"
          className="flex-1 min-w-0 bg-transparent text-[12px] focus:outline-none placeholder:text-muted-foreground/60"
        />
        {q && (
          <button type="button" onClick={() => { setQ(""); setHits(null); }} className="text-muted-foreground hover:text-foreground">
            <X className="size-3.5" />
          </button>
        )}
        <button type="submit" className="rounded-lg border border-white/10 px-2.5 py-1 text-[10px] font-mono uppercase tracking-widest hover:bg-white/5">
          {busy ? "…" : "Find"}
        </button>
      </form>
      {hits && (
        <div className="mt-2 border-t border-white/5 pt-2">
          {hits.length === 0 ? (
            <p className="py-2 text-[11px] text-muted-foreground">No finance records match that search.</p>
          ) : (
            <ul className="max-h-64 overflow-auto divide-y divide-white/5">
              {hits.map((h) => (
                <li key={`${h.kind}-${h.id}`}>
                  <button
                    onClick={() => h.payment_id && onOpenPayment(h.payment_id)}
                    className="w-full text-left py-1.5 flex items-baseline justify-between gap-3 hover:text-accent"
                  >
                    <span className="min-w-0 truncate text-[11px]">
                      <span className="font-medium">{h.label}</span>
                      {h.sub && <span className="text-muted-foreground"> · {h.sub}</span>}
                    </span>
                    <span className="text-[10px] font-mono tabular-nums text-muted-foreground shrink-0">
                      {h.amount ? money(h.amount, h.currency) : ""} {ago(h.at)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export const FinanceOpsIcons = { Gauge, Sparkles, CalendarDays };
