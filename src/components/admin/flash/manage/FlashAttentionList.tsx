/**
 * "Needs attention" — only actionable problems, each with one obvious fix.
 * Consumes the existing conflict intelligence contract; no new logic.
 */
import { AlertTriangle, Info, ShieldAlert, Wrench } from "lucide-react";
import type { Conflict, ConflictSeverity } from "@/lib/flash/flash-intelligence";

const TONE: Record<ConflictSeverity, { chip: string; icon: typeof AlertTriangle }> = {
  critical: { chip: "border-destructive/30 bg-destructive/10 text-destructive", icon: ShieldAlert },
  warning: { chip: "border-amber-500/30 bg-amber-500/10 text-amber-200", icon: AlertTriangle },
  info: { chip: "border-sky-500/30 bg-sky-500/10 text-sky-200", icon: Info },
};

export function FlashAttentionList({
  conflicts, onFix, limit = 6,
}: {
  conflicts: Conflict[];
  onFix: (c: Conflict) => void;
  limit?: number;
}) {
  const ordered = [...conflicts].sort((a, b) => {
    const rank = { critical: 0, warning: 1, info: 2 } as const;
    return rank[a.severity] - rank[b.severity];
  });
  const list = ordered.slice(0, limit);

  if (list.length === 0) {
    return (
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-5">
        <p className="text-sm text-emerald-200">🟢 Everything looks healthy — no deals need attention.</p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {list.map((c) => {
        const tone = TONE[c.severity];
        const Icon = tone.icon;
        return (
          <li key={c.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-border bg-card p-3">
            <div className="flex min-w-0 items-start gap-3">
              <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-full border ${tone.chip}`}>
                <Icon className="size-3.5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{c.title}</p>
                <p className="text-xs text-muted-foreground line-clamp-2">{c.detail}</p>
              </div>
            </div>
            {c.fix && (
              <button onClick={() => onFix(c)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-accent/40 px-3 min-h-11 text-[10px] font-mono uppercase tracking-widest text-accent hover:bg-accent/10 transition">
                <Wrench className="size-3" /> {c.fixLabel ?? "Fix"}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
