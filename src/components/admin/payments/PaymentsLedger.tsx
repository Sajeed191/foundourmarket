import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Search, SlidersHorizontal, Download, FileSpreadsheet, Printer, ChevronLeft, ChevronRight, Loader2, X,
} from "lucide-react";
import { getPaymentsLedgerFn, type LedgerRow } from "@/lib/payments-center-v3.functions";
import { EmptyState, StatusBadge, money, when, maskId, downloadCsv, downloadExcel } from "./ui";

type Sort = "recent" | "oldest" | "amount_desc" | "amount_asc";

export type LedgerFacets = {
  currencies: string[];
  gateways: string[];
  methods: string[];
  countries: string[];
};

const STATUSES = ["all", "succeeded", "pending", "processing", "refunded", "failed"];
const ORDER_STATUSES = ["all", "pending", "paid", "processing", "shipped", "delivered", "cancelled", "returned"];

const field =
  "bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 text-[11px] focus:outline-none focus:border-accent/40 w-full";

export type LedgerPreset = {
  status?: string;
  from?: string;
  to?: string;
  country?: string;
  currency?: string;
  gateway?: string;
  method?: string;
};


export function PaymentsLedger({
  region, facets, refreshKey, preset, onSelect,
}: {
  region: "all" | "india" | "international";
  facets: LedgerFacets;
  refreshKey: number;
  /** Applied from the quick-action bar; re-applied whenever the object identity changes. */
  preset?: LedgerPreset | null;
  onSelect?: (paymentId: string) => void;
}) {
  const ledgerFn = useServerFn(getPaymentsLedgerFn);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [status, setStatus] = useState("all");
  const [orderStatus, setOrderStatus] = useState("all");
  const [currency, setCurrency] = useState("all");
  const [gateway, setGateway] = useState("all");
  const [method, setMethod] = useState("all");
  const [country, setCountry] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(0);

  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const reqId = useRef(0);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => { const t = setTimeout(() => setSearch(query), 300); return () => clearTimeout(t); }, [query]);
  useEffect(() => {
    if (!preset) return;
    setStatus(preset.status ?? "all");
    setFrom(preset.from ?? "");
    setTo(preset.to ?? "");
    setPage(0);
  }, [preset]);
  useEffect(() => { setPage(0); }, [search, status, orderStatus, currency, gateway, method, country, from, to, minAmount, maxAmount, sort, region, pageSize]);

  const load = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    try {
      const res = await ledgerFn({
        data: {
          search: search || undefined,
          from: from ? new Date(from).toISOString() : undefined,
          to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
          region,
          country: country === "all" ? undefined : country,
          currency: currency === "all" ? undefined : currency,
          gateway: gateway === "all" ? undefined : gateway,
          method: method === "all" ? undefined : method,
          status: status === "all" ? undefined : status,
          orderStatus: orderStatus === "all" ? undefined : orderStatus,
          minAmount: minAmount ? Number(minAmount) : undefined,
          maxAmount: maxAmount ? Number(maxAmount) : undefined,
          sort,
          page,
          pageSize,
        },
      });
      if (id !== reqId.current) return;
      setRows(res.rows);
      setTotal(res.total);
    } catch {
      if (id === reqId.current) { setRows([]); setTotal(0); }
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [ledgerFn, search, from, to, region, country, currency, gateway, method, status, orderStatus, minAmount, maxAmount, sort, page, pageSize]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const headers = useMemo(
    () => ["Order ID", "Customer", "Country", "Currency", "Amount", "Method", "Gateway", "Status", "Settlement", "Transaction ID", "Created"],
    [],
  );
  const exportRows = () =>
    rows.map((r) => [
      r.order_id ?? "", r.customer, r.country ?? "", r.currency, r.amount, r.method ?? "",
      r.gateway, r.status, "no data", maskId(r.transaction_id), when(r.created_at),
    ]);

  const activeFilters =
    [status, orderStatus, currency, gateway, method, country].filter((v) => v !== "all").length +
    [from, to, minAmount, maxAmount].filter(Boolean).length;

  const reset = () => {
    setStatus("all"); setOrderStatus("all"); setCurrency("all"); setGateway("all");
    setMethod("all"); setCountry("all"); setFrom(""); setTo(""); setMinAmount(""); setMaxAmount("");
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search customer, order, transaction, email, gateway ID…"
            className={`${field} pl-9`}
          />
        </div>
        <button
          onClick={() => setShowFilters((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] hover:bg-white/[0.06]"
        >
          <SlidersHorizontal className="size-3.5" /> Filters
          {activeFilters > 0 && <span className="rounded-full bg-accent/20 text-accent px-1.5">{activeFilters}</span>}
        </button>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={`${field} w-auto`}>
          <option value="recent" className="bg-background">Newest first</option>
          <option value="oldest" className="bg-background">Oldest first</option>
          <option value="amount_desc" className="bg-background">Amount high → low</option>
          <option value="amount_asc" className="bg-background">Amount low → high</option>
        </select>
        <div className="flex items-center gap-1.5">
          <button onClick={() => downloadCsv("payments", headers, exportRows())} disabled={!rows.length}
            className="rounded-xl border border-white/10 p-2 hover:bg-white/5 disabled:opacity-40" title="Export CSV">
            <Download className="size-3.5" />
          </button>
          <button onClick={() => downloadExcel("payments", headers, exportRows())} disabled={!rows.length}
            className="rounded-xl border border-white/10 p-2 hover:bg-white/5 disabled:opacity-40" title="Export Excel">
            <FileSpreadsheet className="size-3.5" />
          </button>
          <button onClick={() => window.print()} disabled={!rows.length}
            className="rounded-xl border border-white/10 p-2 hover:bg-white/5 disabled:opacity-40" title="Print">
            <Printer className="size-3.5" />
          </button>
        </div>
      </div>

      {showFilters && (
        <>
          <button
            aria-label="Close filters"
            onClick={() => setShowFilters(false)}
            className="md:hidden fixed inset-0 z-40 bg-background/70 backdrop-blur-sm"
          />
          <div className="max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-50 max-md:max-h-[80vh] max-md:overflow-y-auto max-md:rounded-t-3xl glass border border-white/10 rounded-2xl p-3 grid grid-cols-2 md:grid-cols-4 gap-2">
          <label className="space-y-1"><span className="text-[9px] uppercase tracking-widest text-muted-foreground">From</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={field} /></label>
          <label className="space-y-1"><span className="text-[9px] uppercase tracking-widest text-muted-foreground">To</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={field} /></label>
          <label className="space-y-1"><span className="text-[9px] uppercase tracking-widest text-muted-foreground">Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={field}>
              {STATUSES.map((s) => <option key={s} value={s} className="bg-background">{s}</option>)}
            </select></label>
          <label className="space-y-1"><span className="text-[9px] uppercase tracking-widest text-muted-foreground">Order status</span>
            <select value={orderStatus} onChange={(e) => setOrderStatus(e.target.value)} className={field}>
              {ORDER_STATUSES.map((s) => <option key={s} value={s} className="bg-background">{s}</option>)}
            </select></label>
          <label className="space-y-1"><span className="text-[9px] uppercase tracking-widest text-muted-foreground">Currency</span>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={field}>
              {["all", ...facets.currencies].map((s) => <option key={s} value={s} className="bg-background">{s}</option>)}
            </select></label>
          <label className="space-y-1"><span className="text-[9px] uppercase tracking-widest text-muted-foreground">Gateway</span>
            <select value={gateway} onChange={(e) => setGateway(e.target.value)} className={field}>
              {["all", ...facets.gateways].map((s) => <option key={s} value={s} className="bg-background">{s}</option>)}
            </select></label>
          <label className="space-y-1"><span className="text-[9px] uppercase tracking-widest text-muted-foreground">Method</span>
            <select value={method} onChange={(e) => setMethod(e.target.value)} className={field}>
              {["all", ...facets.methods].map((s) => <option key={s} value={s} className="bg-background">{s}</option>)}
            </select></label>
          <label className="space-y-1"><span className="text-[9px] uppercase tracking-widest text-muted-foreground">Country</span>
            <select value={country} onChange={(e) => setCountry(e.target.value)} className={field}>
              {["all", ...facets.countries].map((s) => <option key={s} value={s} className="bg-background">{s}</option>)}
            </select></label>
          <label className="space-y-1"><span className="text-[9px] uppercase tracking-widest text-muted-foreground">Min amount</span>
            <input inputMode="decimal" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} className={field} placeholder="0" /></label>
          <label className="space-y-1"><span className="text-[9px] uppercase tracking-widest text-muted-foreground">Max amount</span>
            <input inputMode="decimal" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} className={field} placeholder="—" /></label>
          <label className="space-y-1"><span className="text-[9px] uppercase tracking-widest text-muted-foreground">Rows per page</span>
            <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className={field}>
              {[25, 50, 100, 200].map((n) => <option key={n} value={n} className="bg-background">{n}</option>)}
            </select></label>
          <button onClick={reset} className="self-end inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-[11px] hover:bg-white/5">
            <X className="size-3.5" /> Clear filters
          </button>
          <button
            onClick={() => setShowFilters(false)}
            className="md:hidden col-span-2 rounded-xl border border-accent/40 bg-accent/10 text-accent px-3 py-2 text-[11px]"
          >
            Show results
          </button>
          </div>
        </>
      )}

      <div ref={printRef} className="glass border border-white/10 rounded-2xl overflow-hidden">
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-left text-[9px] uppercase tracking-[0.18em] text-muted-foreground border-b border-white/10">
                <th className="px-3 py-2.5">Order</th>
                <th className="px-3 py-2.5">Customer</th>
                <th className="px-3 py-2.5">Country</th>
                <th className="px-3 py-2.5">Amount</th>
                <th className="px-3 py-2.5">Method</th>
                <th className="px-3 py-2.5">Gateway</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Settlement</th>
                <th className="px-3 py-2.5">Transaction</th>
                <th className="px-3 py-2.5">Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => onSelect?.(r.id)}
                  className="border-b border-white/5 hover:bg-white/[0.03] cursor-pointer"
                >
                  <td className="px-3 py-2.5 font-mono">{r.order_id?.slice(0, 8) ?? "—"}</td>
                  <td className="px-3 py-2.5">
                    <div className="truncate max-w-[160px]">{r.customer}</div>
                    <div className="text-[10px] text-muted-foreground truncate max-w-[160px]">{r.customer_email ?? ""}</div>
                  </td>
                  <td className="px-3 py-2.5">{r.country ?? "—"}</td>
                  <td className="px-3 py-2.5 font-mono">{money(r.amount, r.currency)}</td>
                  <td className="px-3 py-2.5 capitalize">{r.method ?? "—"}</td>
                  <td className="px-3 py-2.5 capitalize">{r.gateway}</td>
                  <td className="px-3 py-2.5"><StatusBadge status={r.status} /></td>
                  <td className="px-3 py-2.5 text-muted-foreground">No data</td>
                  <td className="px-3 py-2.5 font-mono">{maskId(r.transaction_id)}</td>
                  <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{when(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="md:hidden divide-y divide-white/5">
          {rows.map((r) => (
            <button key={r.id} type="button" onClick={() => onSelect?.(r.id)} className="w-full text-left p-3 active:bg-white/[0.04]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold truncate">{r.customer}</span>
                <span className="font-mono text-sm shrink-0">{money(r.amount, r.currency)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="text-[10px] font-mono text-muted-foreground truncate">
                  {r.order_id?.slice(0, 8) ?? "—"} · {r.gateway} · {r.country ?? "—"}
                </span>
                <StatusBadge status={r.status} />
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">{maskId(r.transaction_id)} · {when(r.created_at)}</p>
            </button>
          ))}
        </div>

        {loading && <div className="p-6 grid place-items-center"><Loader2 className="size-5 animate-spin text-accent" /></div>}
        {!loading && rows.length === 0 && (
          <EmptyState
            title="No payment data available yet."
            hint="Try widening the date range or clearing filters. Payments appear here the moment an order is paid."
          />
        )}
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{total} payment{total === 1 ? "" : "s"}</span>
        <div className="flex items-center gap-2">
          <button disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="rounded-full border border-white/10 p-1.5 hover:bg-white/5 disabled:opacity-40"><ChevronLeft className="size-4" /></button>
          <span>{page + 1} / {pageCount}</span>
          <button disabled={page + 1 >= pageCount} onClick={() => setPage((p) => p + 1)}
            className="rounded-full border border-white/10 p-1.5 hover:bg-white/5 disabled:opacity-40"><ChevronRight className="size-4" /></button>
        </div>
      </div>
    </div>
  );
}
