/**
 * Health + AI advice sheet for a single deal.
 * Explains the verdict, lists derived recommendations with expected impact and
 * confidence, and delegates every "apply" back to the page's existing mutations.
 */
import { X, Sparkles, Wrench } from "lucide-react";
import type { DealEntry } from "@/lib/flash/use-flash-admin";
import type { DealIntelligence } from "@/lib/flash/flash-intelligence";
import {
  HEALTH_TONE_CLASS, healthVerdict, type AdviceAction, type DealAdvice,
} from "@/lib/flash/flash-advice";

const CONFIDENCE_LABEL = { high: "High confidence", medium: "Medium confidence", low: "Low confidence" } as const;

export function FlashAdviceSheet({
  entry, intel, advice, onApply, onClose,
}: {
  entry: DealEntry;
  intel: DealIntelligence | null;
  advice: DealAdvice[];
  onApply: (entry: DealEntry, action: AdviceAction) => void;
  onClose: () => void;
}) {
  const verdict = healthVerdict(intel, entry);

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/60 backdrop-blur-sm sm:place-items-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-label={`Health and recommendations for ${entry.product.name}`}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[88vh] w-full overflow-y-auto rounded-t-3xl border border-border bg-card p-5 sm:max-w-lg sm:rounded-3xl">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">Deal health</p>
            <h3 className="mt-1 truncate font-display text-lg font-semibold">{entry.product.name}</h3>
          </div>
          <button onClick={onClose} aria-label="Close"
            className="grid size-11 shrink-0 place-items-center rounded-full border border-white/10 hover:bg-white/5">
            <X className="size-4" />
          </button>
        </div>

        <div className={`mt-4 rounded-2xl border p-4 ${HEALTH_TONE_CLASS[verdict.tone]}`}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">{verdict.label}</p>
            <p className="font-display text-2xl font-semibold tabular-nums">{verdict.score}</p>
          </div>
          {intel && <p className="mt-2 text-xs opacity-90">{intel.recommendation}</p>}
        </div>

        {intel && intel.reasons.length > 0 && (
          <section className="mt-4">
            <h4 className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">Why?</h4>
            <ul className="mt-2 space-y-1.5">
              {intel.reasons.map((r) => (
                <li key={r} className="text-xs text-muted-foreground">• {r}</li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-5">
          <h4 className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">
            <Sparkles className="size-3.5" /> Recommendations
          </h4>
          {advice.length === 0 ? (
            <p className="mt-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4 text-sm text-emerald-200">
              🟢 Nothing to improve right now — this deal is well configured.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {advice.map((a) => (
                <li key={a.id} className="rounded-2xl border border-border bg-background/40 p-3">
                  <p className="text-sm font-medium">{a.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{a.why}</p>
                  <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                    <p className="min-w-0 truncate text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                      {a.impact} · {CONFIDENCE_LABEL[a.confidence]}
                    </p>
                    <button onClick={() => onApply(entry, a.action)}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-accent/40 px-3 min-h-11 text-[10px] font-mono uppercase tracking-widest text-accent transition hover:bg-accent/10">
                      <Wrench className="size-3" /> {a.actionLabel}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
