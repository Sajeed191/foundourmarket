import { useMemo, useState } from "react";
import { Gauge, RefreshCw } from "lucide-react";
import {
  METRIC_LABELS, memoryEstimateMb, summarizeMetrics, type MetricSummary,
} from "@/lib/editor-perf";

/**
 * Product Editor 8.0 — diagnostics only.
 * Aggregates the in-memory metric buffers on demand; nothing is sampled or
 * observed while the panel is closed, so there is no runtime overhead.
 */

function fmt(ms: number | null): string {
  if (ms == null) return "—";
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;
}

function tone(metric: MetricSummary): string {
  if (metric.p95 == null) return "text-muted-foreground";
  const budget = metric.metric === "autosave" || metric.metric === "ai-generate" ? 1200 : 300;
  if (metric.p95 <= budget * 0.6) return "text-emerald-400";
  if (metric.p95 <= budget) return "text-sky-400";
  if (metric.p95 <= budget * 1.8) return "text-amber-400";
  return "text-destructive";
}

export function EditorDiagnostics() {
  const [nonce, setNonce] = useState(0);
  const rows = useMemo(() => summarizeMetrics(), [nonce]);
  const memory = useMemo(() => memoryEstimateMb(), [nonce]);

  return (
    <section className="editor-surface p-4" aria-labelledby="editor-diagnostics-heading">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 id="editor-diagnostics-heading" className="flex items-center gap-2 text-sm font-medium">
          <Gauge className="size-4 text-accent" aria-hidden="true" /> Editor performance
        </h3>
        <button
          type="button"
          onClick={() => setNonce((n) => n + 1)}
          className="editor-motion inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.03] px-3 text-[11px] font-semibold text-muted-foreground hover:border-white/25 hover:text-foreground active:scale-[0.98]"
        >
          <RefreshCw className="size-3.5" aria-hidden="true" /> Aggregate
        </button>
      </div>

      <ul className="divide-y divide-white/5">
        {rows.map((row) => (
          <li key={row.metric} className="flex items-baseline justify-between gap-3 py-2">
            <span className="min-w-0 truncate text-xs text-muted-foreground">
              {METRIC_LABELS[row.metric]}
              {row.worstLabel ? <span className="ml-1.5 opacity-60">· {row.worstLabel}</span> : null}
            </span>
            <span className={`shrink-0 font-mono text-xs tabular-nums ${tone(row)}`}>
              {fmt(row.last)}
              <span className="ml-2 opacity-50">p95 {fmt(row.p95)}</span>
            </span>
          </li>
        ))}
        <li className="flex items-baseline justify-between gap-3 py-2">
          <span className="text-xs text-muted-foreground">Memory usage estimate</span>
          <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
            {memory == null ? "unavailable" : `${memory} MB`}
          </span>
        </li>
      </ul>

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        Measurements are collected in memory during this session and aggregated only when you press Aggregate.
      </p>
    </section>
  );
}

export default EditorDiagnostics;
