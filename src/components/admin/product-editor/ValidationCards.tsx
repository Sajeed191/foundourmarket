// ============================================================
// ValidationCards — Product Editor 4.0
//
// Replaces flat red/amber "Missing X" errors with premium
// recommendation cards: one plain-language message, an impact
// level, and a single one-click action. Follows the platform AI UX
// rule — recommend, never block; the admin decides.
// ============================================================
import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";

export type Impact = "high" | "medium" | "low";

export type ValidationIssue = {
  id: string;
  title: string;
  /** Why a customer cares — plain language, no jargon. */
  why: string;
  impact: Impact;
  actionLabel: string;
  onAction: () => void;
};

const TONE: Record<Impact, { dot: string; chip: string; label: string }> = {
  high: { dot: "bg-destructive", chip: "bg-destructive/15 text-destructive", label: "High" },
  medium: { dot: "bg-amber-400", chip: "bg-amber-500/15 text-amber-400", label: "Medium" },
  low: { dot: "bg-sky-400", chip: "bg-sky-500/15 text-sky-400", label: "Low" },
};

const ORDER: Impact[] = ["high", "medium", "low"];

export function ValidationCards({ issues }: { issues: ValidationIssue[] }) {
  if (!issues.length) {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-3 text-xs text-emerald-400">
        <CheckCircle2 className="size-4 shrink-0" />
        Nothing to improve — this product is ready for customers.
      </p>
    );
  }
  const sorted = [...issues].sort((a, b) => ORDER.indexOf(a.impact) - ORDER.indexOf(b.impact));
  return (
    <div className="space-y-2">
      {sorted.map((i) => {
        const tone = TONE[i.impact];
        return (
          <article key={i.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <div className="flex items-start gap-2.5">
              <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${tone.dot}`} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="min-w-0 flex-1 truncate text-sm font-semibold">{i.title}</h4>
                  <span className={`shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${tone.chip}`}>
                    {tone.label} impact
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{i.why}</p>
                <button
                  type="button"
                  onClick={i.onAction}
                  className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-3 text-[11px] font-semibold text-accent transition-all hover:bg-accent/20 active:scale-[0.97]"
                >
                  <Sparkles className="size-3" /> {i.actionLabel} <ArrowRight className="size-3" />
                </button>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
