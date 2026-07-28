/**
 * Deal Intelligence sheet — Flash Score breakdown, the single recommendation,
 * the "Why?" reasons, engagement vs marketplace averages, and the performance
 * funnel timeline. Read-only: closing it changes nothing.
 */
import { X } from "lucide-react";
import type { DealEntry } from "@/lib/flash/use-flash-admin";
import type { DealIntelligence } from "@/lib/flash/flash-intelligence";
import { dealTimeline } from "@/lib/flash/flash-intelligence";
import type { HealthTone } from "@/lib/flash/flash-health";

const TONE_TEXT: Record<HealthTone, string> = {
  green: "text-emerald-300", blue: "text-sky-300", amber: "text-amber-300", red: "text-destructive",
};
const TONE_BAR: Record<HealthTone, string> = {
  green: "bg-emerald-400/70", blue: "bg-sky-400/70", amber: "bg-amber-400/70", red: "bg-destructive/70",
};

export function FlashDealIntelligenceSheet({
  entry, intel, averages, onClose,
}: {
  entry: DealEntry;
  intel: DealIntelligence;
  averages: { avgCtr: number; avgConversion: number };
  onClose: () => void;
}) {
  const stages = dealTimeline(entry);
  const peak = Math.max(1, ...stages.map((s) => s.value));

  return (
    <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center bg-black/60 backdrop-blur-sm sm:p-4"
      onClick={onClose}>
      <div role="dialog" aria-label={`Intelligence for ${entry.product.name}`}
        className="w-full sm:max-w-lg max-h-[88dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-border bg-card p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">Flash score</p>
            <p className={`text-3xl font-display font-semibold tabular-nums ${TONE_TEXT[intel.tone]}`}>
              {intel.score}<span className="text-base text-muted-foreground">/100</span>
            </p>
            <p className="text-sm">{intel.grade}</p>
            <p className="text-xs text-muted-foreground truncate mt-1">{entry.product.name}</p>
          </div>
          <button onClick={onClose} aria-label="Close"
            className="size-11 grid place-items-center rounded-full hover:bg-white/5"><X className="size-4" /></button>
        </div>

        <div className="rounded-2xl border border-accent/30 bg-accent/[0.06] p-3">
          <p className="text-[10px] font-mono uppercase tracking-widest text-accent mb-1">Recommendation</p>
          <p className="text-sm">{intel.recommendation}</p>
        </div>

        <section>
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Why?</p>
          <ul className="space-y-1 text-[11px] text-muted-foreground">
            {intel.reasons.map((r) => <li key={r}>• {r}</li>)}
          </ul>
        </section>

        <section>
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Score dimensions</p>
          <ul className="space-y-2">
            {intel.dimensions.map((d) => (
              <li key={d.key} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate">{d.label}</span>
                  <span className="shrink-0 font-mono tabular-nums text-muted-foreground">{Math.round(d.value)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                  <div className={`h-full rounded-full ${TONE_BAR[d.value >= 80 ? "green" : d.value >= 60 ? "blue" : d.value >= 40 ? "amber" : "red"]}`}
                    style={{ width: `${Math.round(d.value)}%` }} />
                </div>
                <p className="text-[10px] text-muted-foreground">{d.detail}</p>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
            Engagement vs marketplace average
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl border border-border bg-background/40 p-2.5">
              <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">CTR</p>
              <p className="tabular-nums">{entry.stats.ctr.toFixed(1)}% <span className="text-muted-foreground">vs {averages.avgCtr.toFixed(1)}%</span></p>
            </div>
            <div className="rounded-xl border border-border bg-background/40 p-2.5">
              <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Conversion</p>
              <p className="tabular-nums">{entry.stats.conversion.toFixed(1)}% <span className="text-muted-foreground">vs {averages.avgConversion.toFixed(1)}%</span></p>
            </div>
          </div>
        </section>

        <section>
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Performance timeline</p>
          <ol className="space-y-2">
            {stages.map((s) => (
              <li key={s.label} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span>{s.label}</span>
                  <span className="font-mono tabular-nums text-muted-foreground">{s.value.toLocaleString()}</span>
                </div>
                <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                  <div className="h-full rounded-full bg-accent/60" style={{ width: `${Math.max(2, (s.value / peak) * 100)}%` }} />
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {entry.status === "expired" ? "This deal has ended." : "Deal is still collecting data."}
          </p>
        </section>
      </div>
    </div>
  );
}
