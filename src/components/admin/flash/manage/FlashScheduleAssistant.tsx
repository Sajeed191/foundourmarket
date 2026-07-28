/**
 * v10.0 — Smart scheduling assistant. Suggests a window learned from recorded
 * click and order history. Nothing is scheduled automatically.
 */
import { CalendarClock, Sparkles } from "lucide-react";
import type { ScheduleSuggestion } from "@/lib/flash/flash-executive";

const pad = (n: number) => String(n).padStart(2, "0");

export function FlashScheduleAssistant({
  suggestion, onUse,
}: {
  suggestion: ScheduleSuggestion;
  onUse: () => void;
}) {
  const rows = [
    { label: "Best start time", value: `${pad(suggestion.startHour)}:00` },
    { label: "Best end time", value: `${pad(suggestion.endHour)}:00` },
    { label: "Best duration", value: `${suggestion.durationHours}h` },
    { label: "Best weekday", value: suggestion.weekday },
    { label: "Best campaign", value: suggestion.campaign ?? "Unassigned" },
    { label: "Expected lift", value: `+${suggestion.expectedLiftPct}%` },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full border border-accent/25 bg-accent/10 text-accent">
          <CalendarClock className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Suggested window</p>
          <p className="truncate text-sm font-medium">
            {suggestion.weekday}, {pad(suggestion.startHour)}:00 for {suggestion.durationHours}h
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {rows.map((r) => (
          <div key={r.label} className="min-w-0 rounded-xl border border-white/5 bg-white/[0.02] p-2.5">
            <p className="truncate text-[9px] font-mono uppercase tracking-widest text-muted-foreground">{r.label}</p>
            <p className="truncate text-sm font-medium">{r.value}</p>
          </div>
        ))}
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">{suggestion.reason}</p>

      <button onClick={onUse}
        className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-accent px-4 text-[10px] font-mono uppercase tracking-widest text-accent-foreground transition hover:opacity-90">
        <Sparkles className="size-3.5" /> Create a deal with this window
      </button>
    </div>
  );
}
