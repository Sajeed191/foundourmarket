/**
 * v11.0 — Daily Merchandising Brief. One compact paragraph on open, dismissible
 * for the day. Presentation only: it reads derived state, never mutates deals.
 */
import { Sparkles, X, ArrowRight, EyeOff } from "lucide-react";
import type { DailyBrief } from "@/lib/flash/flash-assistant";

const TONE: Record<DailyBrief["tone"], string> = {
  green: "border-emerald-500/20 from-emerald-500/[0.07]",
  blue: "border-sky-500/20 from-sky-500/[0.07]",
  amber: "border-amber-500/25 from-amber-500/[0.08]",
  red: "border-destructive/25 from-destructive/[0.08]",
};

export function FlashDailyBrief({
  brief, onReview, onDismiss, onNeverShow,
}: {
  brief: DailyBrief;
  onReview: () => void;
  onDismiss: () => void;
  onNeverShow: () => void;
}) {
  return (
    <section
      aria-label="Daily merchandising brief"
      className={`animate-in fade-in slide-in-from-top-2 rounded-[23px] border bg-gradient-to-br to-transparent p-5 duration-500 sm:p-6 ${TONE[brief.tone]}`}
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full border border-accent/30 bg-accent/10 text-accent">
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">Daily brief</p>
          <h2 className="mt-0.5 font-display text-lg font-semibold">{brief.greeting}</h2>
        </div>
        <button
          onClick={onDismiss}
          aria-label="Dismiss brief"
          className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-white/5"
        >
          <X className="size-4" />
        </button>
      </div>

      <ul className="mt-3 space-y-1">
        {brief.lines.map((l) => (
          <li key={l} className="text-sm leading-relaxed text-foreground/90">{l}</li>
        ))}
      </ul>

      {brief.opportunity && (
        <p className="mt-3 rounded-2xl border border-white/5 bg-white/[0.03] p-3 text-[13px] leading-relaxed text-foreground/90">
          <span className="font-mono text-[9px] uppercase tracking-widest text-accent">Biggest opportunity</span>
          <br />
          {brief.opportunity.text}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          onClick={onReview}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-accent px-5 text-[11px] font-mono uppercase tracking-widest text-accent-foreground transition hover:opacity-90"
        >
          Review <ArrowRight className="size-3.5" />
        </button>
        <button
          onClick={onDismiss}
          className="inline-flex min-h-11 items-center rounded-full border border-white/10 px-4 text-[11px] font-mono uppercase tracking-widest text-muted-foreground transition hover:bg-white/5"
        >
          Dismiss
        </button>
        <button
          onClick={onNeverShow}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[11px] font-mono uppercase tracking-widest text-muted-foreground transition hover:bg-white/5"
        >
          <EyeOff className="size-3.5" /> Don't show again
        </button>
      </div>
    </section>
  );
}
