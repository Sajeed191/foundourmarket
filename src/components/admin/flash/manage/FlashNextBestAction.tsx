/**
 * v11.0 — Next Best Action. Always exactly one primary recommendation so the
 * admin never has to decide what to look at first.
 */
import { Target, ArrowRight } from "lucide-react";
import type { NextBestAction } from "@/lib/flash/flash-assistant";

export function FlashNextBestAction({ action, onAct }: { action: NextBestAction; onAct: (a: NextBestAction) => void }) {
  return (
    <section
      aria-label="Next best action"
      className="rounded-[23px] border border-accent/25 bg-gradient-to-br from-accent/[0.08] to-transparent p-4 sm:p-5"
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full border border-accent/30 bg-accent/10 text-accent">
          <Target className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">Next best action</p>
          <p className="mt-1 text-sm font-medium leading-snug">{action.title}</p>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{action.why}</p>
          <button
            onClick={() => onAct(action)}
            className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-accent px-5 text-[10px] font-mono uppercase tracking-widest text-accent-foreground transition hover:opacity-90"
          >
            {action.actionLabel} <ArrowRight className="size-3.5" />
          </button>
        </div>
      </div>
    </section>
  );
}
