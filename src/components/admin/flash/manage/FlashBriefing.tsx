/**
 * Today's Flash Deal Brief — one paragraph that answers "how are we doing?"
 * in under ten seconds, plus a single primary action.
 */
import { Sparkles, ArrowRight } from "lucide-react";
import type { Briefing } from "@/lib/flash/flash-autonomy";

const TONE: Record<Briefing["tone"], string> = {
  green: "border-emerald-500/20 from-emerald-500/[0.07]",
  blue: "border-sky-500/20 from-sky-500/[0.07]",
  amber: "border-amber-500/25 from-amber-500/[0.08]",
  red: "border-destructive/25 from-destructive/[0.08]",
};

function money(n: number) {
  return n >= 100000 ? `${Math.round(n / 1000)}k` : Math.round(n).toLocaleString();
}

export function FlashBriefing({
  briefing, queueCount, onOptimize,
}: {
  briefing: Briefing;
  queueCount: number;
  onOptimize: () => void;
}) {
  return (
    <section
      aria-label="Today's flash deal brief"
      className={`rounded-[23px] border bg-gradient-to-br to-transparent p-5 sm:p-6 ${TONE[briefing.tone]}`}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">Today</p>
          <h2 className="mt-1 font-display text-lg font-semibold sm:text-xl">Flash deal brief</h2>
        </div>
        <span className="grid size-10 shrink-0 place-items-center rounded-full border border-accent/30 bg-accent/10 text-accent">
          <Sparkles className="size-4" />
        </span>
      </div>

      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-foreground/90">{briefing.sentence}</p>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        {[
          { label: "Live", value: String(briefing.live) },
          { label: "Ending < 2h", value: String(briefing.endingSoon) },
          { label: "Revenue potential", value: money(briefing.revenuePotential) },
          { label: "Needs attention", value: String(briefing.attention) },
        ].map((s) => (
          <div key={s.label} className="min-w-0">
            <dt className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">{s.label}</dt>
            <dd className="mt-0.5 truncate text-xl font-semibold tabular-nums">{s.value}</dd>
          </div>
        ))}
      </dl>

      <button
        onClick={onOptimize}
        className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-accent px-5 text-[11px] font-mono uppercase tracking-widest text-accent-foreground transition hover:opacity-90"
      >
        Optimize flash deals
        {queueCount > 0 && <span className="tabular-nums opacity-80">({queueCount})</span>}
        <ArrowRight className="size-3.5" />
      </button>
    </section>
  );
}
