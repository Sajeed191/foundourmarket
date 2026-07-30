import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Inbox, Minus } from "lucide-react";

/** Shared primitives for the Payments Center v3 admin surface. */

export const money = (v: number | null | undefined, currency = "INR") => {
  const n = Number(v) || 0;
  try {
    return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: n >= 1000 ? 0 : 2,
    }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
};

export const compact = (v: number | null | undefined) =>
  new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(Number(v) || 0);

export const when = (s: string) =>
  new Date(s).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

export const ago = (s: string) => {
  const diff = Date.now() - new Date(s).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
};

/** Mask sensitive gateway/transaction identifiers — never show them in full. */
export const maskId = (id: string | null | undefined) => {
  if (!id) return "—";
  if (id.length <= 10) return `${id.slice(0, 3)}••••`;
  return `${id.slice(0, 6)}••••${id.slice(-4)}`;
};

export function Trend({ delta }: { delta: number | null | undefined }) {
  if (delta == null || !Number.isFinite(delta)) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        <Minus className="size-3" /> no baseline
      </span>
    );
  }
  const up = delta >= 0;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest ${
        up ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" : "text-destructive border-destructive/30 bg-destructive/10"
      }`}
    >
      {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
      {Math.abs(delta).toFixed(1)}%
    </span>
  );
}

export function StatKpi({
  label, value, sub, delta, icon, tone,
}: {
  label: string; value: ReactNode; sub?: ReactNode; delta?: number | null; icon?: ReactNode; tone?: string;
}) {
  return (
    <div className="glass border border-white/10 rounded-2xl p-3.5 min-w-0">
      <div className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
        {icon && <span className={tone ?? "text-accent"}>{icon}</span>}
        <span className="truncate">{label}</span>
      </div>
      <p className="mt-1.5 text-lg font-semibold tabular-nums truncate">{value}</p>
      <div className="mt-1.5 flex items-center gap-2 min-w-0">
        {delta !== undefined && <Trend delta={delta} />}
        {sub && <span className="text-[10px] text-muted-foreground truncate">{sub}</span>}
      </div>
    </div>
  );
}

export function Panel({
  title, hint, actions, children, className,
}: { title: string; hint?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`glass border border-white/10 rounded-2xl overflow-hidden ${className ?? ""}`}>
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/5">
        <div className="min-w-0">
          <h3 className="text-[11px] font-mono uppercase tracking-[0.22em] text-muted-foreground truncate">{title}</h3>
          {hint && <p className="text-[10px] text-muted-foreground/70 truncate">{hint}</p>}
        </div>
        {actions}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function EmptyState({ title = "No payment data available yet.", hint }: { title?: string; hint?: string }) {
  return (
    <div className="py-8 grid place-items-center text-center gap-2">
      <Inbox className="size-5 text-muted-foreground/60" />
      <p className="text-xs text-muted-foreground">{title}</p>
      {hint && <p className="text-[10px] text-muted-foreground/70 max-w-xs">{hint}</p>}
    </div>
  );
}

const STATUS_TONE: Record<string, string> = {
  paid: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
  succeeded: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
  settled: "text-emerald-300 border-emerald-400/30 bg-emerald-400/10",
  pending: "text-amber-400 border-amber-500/30 bg-amber-500/10",
  processing: "text-sky-400 border-sky-500/30 bg-sky-500/10",
  refunded: "text-violet-300 border-violet-500/30 bg-violet-500/10",
  failed: "text-destructive border-destructive/30 bg-destructive/10",
  cancelled: "text-muted-foreground border-white/10 bg-white/5",
  chargeback: "text-orange-400 border-orange-500/30 bg-orange-500/10",
  disputed: "text-orange-300 border-orange-400/30 bg-orange-400/10",
};

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const s = (status ?? "unknown").toLowerCase();
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-mono uppercase tracking-[0.15em] ${
        STATUS_TONE[s] ?? "text-muted-foreground border-white/10 bg-white/5"
      }`}
    >
      {s}
    </span>
  );
}

/** Horizontal distribution bars — pure presentation of real aggregates. */
export function BarList({
  items, currency = "INR", asMoney = true, empty = "No data available",
}: {
  items: { k: string; v: number; n?: number }[];
  currency?: string;
  asMoney?: boolean;
  empty?: string;
}) {
  if (!items.length) return <EmptyState title={empty} />;
  const max = Math.max(...items.map((i) => i.v), 1);
  return (
    <ul className="space-y-2">
      {items.map((i) => (
        <li key={i.k} className="min-w-0">
          <div className="flex items-baseline justify-between gap-3 text-[11px]">
            <span className="truncate capitalize">{i.k}</span>
            <span className="font-mono tabular-nums shrink-0">
              {asMoney ? money(i.v, currency) : compact(i.v)}
              {i.n != null && <span className="text-muted-foreground"> · {i.n}</span>}
            </span>
          </div>
          <div className="mt-1 h-1 rounded-full bg-white/5 overflow-hidden">
            <div className="h-full rounded-full bg-accent/70" style={{ width: `${(i.v / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Client-side exports built from already-loaded rows (no extra requests). */
export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
  triggerDownload(new Blob([csv], { type: "text/csv;charset=utf-8;" }), `${filename}.csv`);
}

export function downloadExcel(filename: string, headers: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) =>
    String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<html><head><meta charset="utf-8"/></head><body><table border="1"><thead><tr>${headers
    .map((h) => `<th>${esc(h)}</th>`)
    .join("")}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`)
    .join("")}</tbody></table></body></html>`;
  triggerDownload(new Blob([html], { type: "application/vnd.ms-excel" }), `${filename}.xls`);
}

function triggerDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
