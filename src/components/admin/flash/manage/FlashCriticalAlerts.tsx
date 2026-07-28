/**
 * Critical alerts dashboard — the first thing an admin sees.
 *
 * Consumes the existing conflict intelligence contract only: it groups the
 * conflicts by severity, lets the admin filter to one severity, and offers the
 * same one-click fix the conflict already declares. No detection logic here.
 */
import { useMemo, useState } from "react";
import { AlertTriangle, Info, ShieldAlert, Wrench, ChevronDown } from "lucide-react";
import type { Conflict, ConflictSeverity } from "@/lib/flash/flash-intelligence";

const TONE: Record<ConflictSeverity, { chip: string; ring: string; icon: typeof AlertTriangle; label: string }> = {
  critical: { chip: "border-destructive/30 bg-destructive/10 text-destructive", ring: "border-destructive/25", icon: ShieldAlert, label: "Critical" },
  warning: { chip: "border-amber-500/30 bg-amber-500/10 text-amber-200", ring: "border-amber-500/20", icon: AlertTriangle, label: "Warnings" },
  info: { chip: "border-sky-500/30 bg-sky-500/10 text-sky-200", ring: "border-sky-500/20", icon: Info, label: "Suggestions" },
};

const RANK: Record<ConflictSeverity, number> = { critical: 0, warning: 1, info: 2 };
const SEVERITIES: ConflictSeverity[] = ["critical", "warning", "info"];

export function FlashCriticalAlerts({
  conflicts, onFix, initialLimit = 6,
}: {
  conflicts: Conflict[];
  onFix: (c: Conflict) => void;
  initialLimit?: number;
}) {
  const [only, setOnly] = useState<ConflictSeverity | "all">("all");
  const [expanded, setExpanded] = useState(false);

  const counts = useMemo(() => {
    const c = { critical: 0, warning: 0, info: 0 } as Record<ConflictSeverity, number>;
    for (const x of conflicts) c[x.severity]++;
    return c;
  }, [conflicts]);

  const list = useMemo(() => {
    const filtered = only === "all" ? conflicts : conflicts.filter((c) => c.severity === only);
    return [...filtered].sort((a, b) => RANK[a.severity] - RANK[b.severity]);
  }, [conflicts, only]);

  if (conflicts.length === 0) {
    return (
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-6 text-center">
        <p className="text-sm text-emerald-200">🟢 Everything looks healthy — nothing needs your attention.</p>
        <p className="mt-1 text-xs text-emerald-200/60">Deals, badges, stock and pricing all pass their checks.</p>
      </div>
    );
  }

  const shown = expanded ? list : list.slice(0, initialLimit);

  return (
    <div className="space-y-3">
      {/* Severity summary — tap a card to focus that severity */}
      <div className="grid grid-cols-3 gap-2">
        {SEVERITIES.map((s) => {
          const tone = TONE[s];
          const Icon = tone.icon;
          const active = only === s;
          return (
            <button
              key={s}
              onClick={() => setOnly(active ? "all" : s)}
              aria-pressed={active}
              className={`rounded-2xl border bg-card p-3 text-left transition hover:bg-white/[0.03] ${
                active ? "border-accent/50" : tone.ring
              }`}
            >
              <span className={`grid size-8 place-items-center rounded-full border ${tone.chip}`}>
                <Icon className="size-3.5" />
              </span>
              <p className="mt-2 text-2xl font-semibold tabular-nums leading-none">{counts[s]}</p>
              <p className="mt-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{tone.label}</p>
            </button>
          );
        })}
      </div>

      <ul className="space-y-2">
        {shown.map((c) => {
          const tone = TONE[c.severity];
          const Icon = tone.icon;
          return (
            <li
              key={c.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-border bg-card p-3 transition hover:border-white/20"
            >
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
                <button
                  onClick={() => onFix(c)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-accent/40 px-3 min-h-11 text-[10px] font-mono uppercase tracking-widest text-accent transition hover:bg-accent/10"
                >
                  <Wrench className="size-3" /> {c.fixLabel ?? "Fix"}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {list.length > initialLimit && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/10 min-h-11 text-[10px] font-mono uppercase tracking-widest text-muted-foreground transition hover:bg-white/5"
        >
          <ChevronDown className={`size-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
          {expanded ? "Show less" : `Show all ${list.length}`}
        </button>
      )}
    </div>
  );
}
