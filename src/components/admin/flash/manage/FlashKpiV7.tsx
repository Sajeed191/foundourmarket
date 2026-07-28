/**
 * v7.0 summary bar — the only five questions an admin needs answered.
 * Every card is clickable and filters the workspace below.
 */
import { Flame, CalendarClock, TimerReset, Wallet, AlertTriangle } from "lucide-react";

export type KpiKey = "active" | "scheduled" | "ending_soon" | "revenue" | "attention";

const TONE = {
  emerald: "border-emerald-500/25 bg-emerald-500/[0.06] text-emerald-300",
  sky: "border-sky-500/25 bg-sky-500/[0.06] text-sky-300",
  orange: "border-orange-500/25 bg-orange-500/[0.06] text-orange-300",
  accent: "border-accent/25 bg-accent/[0.06] text-accent",
  red: "border-destructive/25 bg-destructive/[0.06] text-destructive",
} as const;

function compact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

export function FlashKpiV7({
  live, scheduled, endingSoon, revenuePotential, attention, onSelect,
}: {
  live: number;
  scheduled: number;
  endingSoon: number;
  revenuePotential: number;
  attention: number;
  onSelect: (key: KpiKey) => void;
}) {
  const cards = [
    { key: "active", label: "Live deals", value: String(live), icon: Flame, tone: TONE.emerald },
    { key: "scheduled", label: "Scheduled", value: String(scheduled), icon: CalendarClock, tone: TONE.sky },
    { key: "ending_soon", label: "Ending < 2h", value: String(endingSoon), icon: TimerReset, tone: TONE.orange },
    { key: "revenue", label: "Revenue potential", value: compact(revenuePotential), icon: Wallet, tone: TONE.accent },
    { key: "attention", label: "Needs attention", value: String(attention), icon: AlertTriangle, tone: TONE.red },
  ] as const;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <button key={c.key} onClick={() => onSelect(c.key)}
            className={`rounded-2xl border p-3 text-left transition duration-200 hover:brightness-125 ${c.tone}`}>
            <span className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.22em] opacity-90">
              <Icon className="size-3.5 shrink-0" /> <span className="truncate">{c.label}</span>
            </span>
            <p className="mt-1.5 font-display text-2xl font-semibold tabular-nums text-foreground">{c.value}</p>
          </button>
        );
      })}
    </div>
  );
}
