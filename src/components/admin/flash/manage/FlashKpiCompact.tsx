/**
 * Four operational KPIs only. Everything else lives inside Analytics.
 */
import { Flame, CalendarClock, TimerReset, AlertTriangle } from "lucide-react";

const TONE = {
  emerald: "text-emerald-300 border-emerald-500/25 bg-emerald-500/[0.06]",
  sky: "text-sky-300 border-sky-500/25 bg-sky-500/[0.06]",
  orange: "text-orange-300 border-orange-500/25 bg-orange-500/[0.06]",
  red: "text-destructive border-destructive/25 bg-destructive/[0.06]",
} as const;

export function FlashKpiCompact({
  active, scheduled, endingSoon, attention, onSelect,
}: {
  active: number;
  scheduled: number;
  endingSoon: number;
  attention: number;
  onSelect: (filter: "active" | "scheduled" | "ending_soon" | "attention") => void;
}) {
  const cards = [
    { key: "active", label: "Active deals", value: active, icon: Flame, tone: TONE.emerald },
    { key: "scheduled", label: "Scheduled", value: scheduled, icon: CalendarClock, tone: TONE.sky },
    { key: "ending_soon", label: "Ending soon", value: endingSoon, icon: TimerReset, tone: TONE.orange },
    { key: "attention", label: "Needs attention", value: attention, icon: AlertTriangle, tone: TONE.red },
  ] as const;

  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <button key={c.key} onClick={() => onSelect(c.key)}
            className={`rounded-2xl border p-3 text-left transition hover:brightness-125 ${c.tone}`}>
            <span className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.25em] opacity-90">
              <Icon className="size-3.5" /> <span className="truncate">{c.label}</span>
            </span>
            <p className="mt-1.5 font-display text-2xl font-semibold tabular-nums text-foreground">{c.value}</p>
          </button>
        );
      })}
    </div>
  );
}
