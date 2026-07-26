/**
 * Product Editor 8.0 — diagnostics-only performance instrumentation.
 *
 * Zero runtime cost by design: callers record a single number into an
 * in-memory ring buffer (no observers, no timers, no storage writes).
 * Aggregation happens on demand when the admin opens the diagnostics panel.
 */

export type EditorMetric =
  | "editor-startup"
  | "preview-render"
  | "autosave"
  | "ai-generate"
  | "publish-prepare"
  | "section-render";

type Sample = { ms: number; at: number; label?: string };

const MAX = 40;
const buffers = new Map<EditorMetric, Sample[]>();

export function recordMetric(metric: EditorMetric, ms: number, label?: string): void {
  if (!Number.isFinite(ms) || ms < 0) return;
  const list = buffers.get(metric) ?? [];
  list.push({ ms, at: Date.now(), label });
  if (list.length > MAX) list.splice(0, list.length - MAX);
  buffers.set(metric, list);
}

/** Times an async or sync operation and records the elapsed ms. */
export async function timeMetric<T>(
  metric: EditorMetric,
  fn: () => T | Promise<T>,
  label?: string,
): Promise<T> {
  const started = typeof performance !== "undefined" ? performance.now() : Date.now();
  try {
    return await fn();
  } finally {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    recordMetric(metric, now - started, label);
  }
}

export type MetricSummary = {
  metric: EditorMetric;
  count: number;
  last: number | null;
  avg: number | null;
  p95: number | null;
  worstLabel?: string;
};

const ORDER: EditorMetric[] = [
  "editor-startup",
  "preview-render",
  "autosave",
  "ai-generate",
  "publish-prepare",
  "section-render",
];

export const METRIC_LABELS: Record<EditorMetric, string> = {
  "editor-startup": "Editor startup",
  "preview-render": "Preview render",
  autosave: "Auto-save latency",
  "ai-generate": "AI generation",
  "publish-prepare": "Publish preparation",
  "section-render": "Largest editor section",
};

/** Aggregate every buffer on demand. Pure read — never mutates state. */
export function summarizeMetrics(): MetricSummary[] {
  return ORDER.map((metric) => {
    const list = buffers.get(metric) ?? [];
    if (!list.length) return { metric, count: 0, last: null, avg: null, p95: null };
    const sorted = [...list].map((s) => s.ms).sort((a, b) => a - b);
    const worst = [...list].sort((a, b) => b.ms - a.ms)[0];
    return {
      metric,
      count: list.length,
      last: list[list.length - 1].ms,
      avg: sorted.reduce((a, b) => a + b, 0) / sorted.length,
      p95: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))],
      worstLabel: worst?.label,
    };
  });
}

/** Rough JS heap estimate in MB, when the browser exposes it. */
export function memoryEstimateMb(): number | null {
  if (typeof performance === "undefined") return null;
  const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  if (!mem) return null;
  return Math.round(mem.usedJSHeapSize / 1048576);
}

export function clearMetrics(): void {
  buffers.clear();
}
