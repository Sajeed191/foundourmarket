/**
 * v13.0 — End-of-day summary.
 *
 * A calm read-only recap generated from the existing executive report. One
 * export button, no configuration.
 */
import { memo } from "react";
import { Download, TrendingUp, TrendingDown } from "lucide-react";
import type { ExecutiveReport } from "@/lib/flash/flash-executive";

function compact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

export const FlashEndOfDay = memo(function FlashEndOfDay({
  report, dealsRan, onExport,
}: {
  report: ExecutiveReport;
  dealsRan: number;
  onExport: () => void;
}) {
  const best = report.best[0] ?? null;
  const worst = report.worst[0] ?? null;

  const stats = [
    { label: "Deals ran", value: String(dealsRan) },
    { label: "Revenue", value: compact(report.revenue) },
    { label: "Orders", value: compact(report.orders) },
    { label: "CTR", value: `${report.ctr.toFixed(1)}%` },
  ];

  return (
    <section className="overflow-hidden rounded-[22px] border border-border bg-card">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-white/5 p-4">
        <div className="min-w-0">
          <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-muted-foreground">Summary</p>
          <p className="truncate text-sm">{report.label} results</p>
        </div>
        <button
          onClick={onExport}
          className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-white/10 px-3.5 text-[10px] font-mono uppercase tracking-widest transition hover:bg-white/5"
        >
          <Download className="size-3.5" aria-hidden /> Export
        </button>
      </header>

      <div className="grid grid-cols-2 gap-px bg-white/5 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="min-w-0 bg-card p-3">
            <p className="truncate text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">{s.label}</p>
            <p className="mt-1 font-display text-xl font-semibold tabular-nums">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-px bg-white/5 sm:grid-cols-2">
        <div className="min-w-0 bg-card p-4">
          <p className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.18em] text-emerald-300">
            <TrendingUp className="size-3" aria-hidden /> Best deal
          </p>
          <p className="mt-1 truncate text-sm">{best?.name ?? "No results yet"}</p>
          {best && (
            <p className="text-[11px] text-muted-foreground tabular-nums">
              {compact(best.revenue)} revenue · {best.ctr.toFixed(1)}% CTR
            </p>
          )}
        </div>
        <div className="min-w-0 bg-card p-4">
          <p className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.18em] text-orange-300">
            <TrendingDown className="size-3" aria-hidden /> Needs a rethink
          </p>
          <p className="mt-1 truncate text-sm">{worst?.name ?? "Nothing underperforming"}</p>
          {worst && (
            <p className="text-[11px] text-muted-foreground tabular-nums">
              {compact(worst.views)} views · {worst.ctr.toFixed(1)}% CTR
            </p>
          )}
        </div>
      </div>

      {report.recommendations.length > 0 && (
        <ul className="space-y-1.5 border-t border-white/5 p-4">
          {report.recommendations.slice(0, 3).map((r) => (
            <li key={r} className="flex gap-2 text-[13px] leading-relaxed text-muted-foreground">
              <span className="mt-[7px] size-1 shrink-0 rounded-full bg-accent" aria-hidden />
              <span className="min-w-0">{r}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
});
