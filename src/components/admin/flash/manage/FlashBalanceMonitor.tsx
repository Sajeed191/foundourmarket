/**
 * v10.0 — Homepage balance monitor. Visualises the distribution of what the
 * storefront is currently showing and recommends when to rebalance.
 */
import { Scale } from "lucide-react";
import type { BalanceReport, Tone } from "@/lib/flash/flash-executive";

const BAR: Record<Tone, string> = {
  green: "bg-emerald-400/70",
  blue: "bg-sky-400/70",
  amber: "bg-orange-400/70",
  red: "bg-destructive/80",
};

export function FlashBalanceMonitor({ report, onReshuffle }: { report: BalanceReport; onReshuffle: () => void }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-border bg-card p-3.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-full border border-white/10 text-muted-foreground">
          <Scale className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{report.headline}</p>
          <p className="text-[11px] text-muted-foreground">Homepage balance across 8 dimensions</p>
        </div>
        <span className="shrink-0 font-display text-xl font-semibold tabular-nums">{report.score}</span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {report.dimensions.map((d) => (
          <div key={d.key} className="rounded-2xl border border-border bg-card p-3.5">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">{d.label}</p>
              <span className="shrink-0 text-sm font-medium tabular-nums">{d.score}</span>
            </div>
            <ul className="mt-2 space-y-1.5">
              {d.bars.map((b) => (
                <li key={b.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[11px] text-foreground/80">{b.label}</p>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/8">
                      <div className={`h-full rounded-full ${BAR[b.tone]} transition-[width] duration-500`} style={{ width: `${Math.min(100, b.pct)}%` }} />
                    </div>
                  </div>
                  <span className="shrink-0 text-[10px] font-mono tabular-nums text-muted-foreground">{b.pct}%</span>
                </li>
              ))}
            </ul>
            {d.score < 75 && <p className="mt-2 text-[11px] leading-relaxed text-orange-300">{d.advice}</p>}
          </div>
        ))}
      </div>

      {report.recommendations.length > 0 && (
        <div className="rounded-2xl border border-accent/20 bg-accent/[0.05] p-3.5">
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-accent">Rebalance recommendations</p>
          <ul className="mt-1.5 space-y-1 text-[11px] leading-relaxed text-foreground/85">
            {report.recommendations.map((r) => <li key={r}>· {r}</li>)}
          </ul>
          <button onClick={onReshuffle}
            className="mt-2.5 inline-flex min-h-11 items-center rounded-full border border-white/10 px-3.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:bg-white/5">
            Reshuffle the homepage
          </button>
        </div>
      )}
    </div>
  );
}
