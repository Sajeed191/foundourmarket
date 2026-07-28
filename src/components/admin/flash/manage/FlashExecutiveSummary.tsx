/**
 * v10.0 — Executive dashboard. One overall score, one plain sentence and the
 * eight health dimensions that matter. Read-only presentation.
 */
import { ChevronRight } from "lucide-react";
import type { ExecutiveSummary, Tone } from "@/lib/flash/flash-executive";

const RING: Record<Tone, string> = {
  green: "text-emerald-300",
  blue: "text-sky-300",
  amber: "text-orange-300",
  red: "text-destructive",
};

const DOT: Record<Tone, string> = {
  green: "bg-emerald-400",
  blue: "bg-sky-400",
  amber: "bg-orange-400",
  red: "bg-destructive",
};

export function FlashExecutiveSummary({
  summary, queueCount, onOptimize, onSelectMetric,
}: {
  summary: ExecutiveSummary;
  queueCount: number;
  onOptimize: () => void;
  onSelectMetric?: (key: string) => void;
}) {
  const circumference = 2 * Math.PI * 34;
  const dash = (summary.overall / 100) * circumference;

  return (
    <section className="overflow-hidden rounded-[26px] border border-border bg-card">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4 border-b border-white/5 p-4 sm:p-5">
        <div className="relative size-[86px] shrink-0">
          <svg viewBox="0 0 80 80" className="size-full -rotate-90">
            <circle cx="40" cy="40" r="34" fill="none" stroke="currentColor" strokeWidth="5" className="text-white/8" />
            <circle
              cx="40" cy="40" r="34" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round"
              strokeDasharray={`${dash} ${circumference}`}
              className={`${RING[summary.tone]} transition-[stroke-dasharray] duration-700`}
            />
          </svg>
          <span className="absolute inset-0 grid place-items-center font-display text-2xl font-semibold tabular-nums">
            {summary.overall}
          </span>
        </div>

        <div className="min-w-0 space-y-1.5">
          <p className="text-[10px] font-mono uppercase tracking-[0.24em] text-muted-foreground">Executive summary</p>
          <p className="text-sm leading-relaxed text-foreground/90">{summary.sentence}</p>
          <button
            onClick={onOptimize}
            className="inline-flex min-h-11 items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-accent"
          >
            Review {queueCount} recommendation{queueCount === 1 ? "" : "s"} <ChevronRight className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px bg-white/5 sm:grid-cols-4">
        {summary.metrics.map((m) => (
          <button
            key={m.key}
            onClick={() => onSelectMetric?.(m.key)}
            className="min-w-0 bg-card p-3 text-left transition hover:bg-white/[0.03]"
          >
            <span className="flex items-center gap-1.5">
              <span className={`size-1.5 shrink-0 rounded-full ${DOT[m.tone]}`} />
              <span className="truncate text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">{m.label}</span>
            </span>
            <p className="mt-1 font-display text-xl font-semibold tabular-nums">{m.score}</p>
            <p className="truncate text-[11px] text-muted-foreground">{m.value}</p>
          </button>
        ))}
      </div>
    </section>
  );
}
