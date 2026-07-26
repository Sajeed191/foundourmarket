import { Sparkles, ShieldCheck, Wand2 } from "lucide-react";

/* ---------------------------------------------------------------------------
 * Product Editor 10.0 — Invisible Experience (presentation only).
 * ------------------------------------------------------------------------- */

/** Publish confidence — one number, one suggestion, one button. */
export function PublishConfidence({
  score, topSuggestion, actionLabel, onFix,
}: {
  score: number;
  topSuggestion?: string;
  actionLabel?: string;
  onFix?: () => void;
}) {
  const ready = score >= 85 && !topSuggestion;
  const tone = ready
    ? "border-emerald-500/25 bg-emerald-500/[0.06] text-emerald-400"
    : score >= 60
      ? "border-accent/25 bg-accent/[0.06] text-accent"
      : "border-amber-500/25 bg-amber-500/[0.06] text-amber-400";

  return (
    <section className={`rounded-2xl border p-3.5 ${tone}`} aria-live="polite">
      <div className="flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/[0.06]">
          <ShieldCheck className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {ready ? "Ready to publish" : "Almost ready"}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {topSuggestion ?? "Everything important is in place."}
          </p>
        </div>
        <span className="shrink-0 text-lg font-bold tabular-nums">{score}%</span>
      </div>
      {topSuggestion && onFix && (
        <button
          type="button"
          onClick={onFix}
          className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-white/12 bg-white/[0.04] px-4 text-sm font-semibold text-foreground transition-[background-color,transform] duration-[var(--editor-motion-fast,160ms)] hover:bg-white/[0.08] active:scale-[0.99] sm:w-auto"
        >
          <Wand2 className="size-4" /> {actionLabel ?? "Fix now"}
        </button>
      )}
    </section>
  );
}

/** Category-aware specification template suggestion. */
export function SpecTemplateStrip({
  label, missing, onAddAll, onDismiss,
}: {
  label: string;
  missing: string[];
  onAddAll: () => void;
  onDismiss: () => void;
}) {
  if (!missing.length) return null;
  return (
    <div className="rounded-xl border border-accent/20 bg-accent/[0.05] p-3">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold text-accent">
        <Sparkles className="size-3.5 shrink-0" /> {label} specifications
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Most {label.toLowerCase()} listings include: {missing.join(" · ")}
      </p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onAddAll}
          className="inline-flex min-h-9 items-center rounded-full bg-accent px-3.5 text-xs font-semibold text-accent-foreground transition-transform duration-[var(--editor-motion-fast,160ms)] active:scale-[0.97]"
        >
          Add all {missing.length}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="inline-flex min-h-9 items-center rounded-full border border-white/12 px-3.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
