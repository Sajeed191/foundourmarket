/**
 * v13.0 — Executive status strip.
 *
 * One sticky, scannable row that answers the whole health question in under
 * five seconds. Presentation only: every number is passed in from the existing
 * derivations, nothing is fetched or computed here.
 */
import { memo } from "react";
import {
  Flame, CalendarClock, TimerReset, Wallet, MousePointerClick,
  ShoppingBag, HeartPulse, Sparkles,
} from "lucide-react";

export type StatusKey =
  | "live" | "scheduled" | "ending" | "revenue"
  | "ctr" | "conversion" | "health" | "confidence";

export type StatusTone = "green" | "blue" | "amber" | "red" | "neutral";

const TONE: Record<StatusTone, string> = {
  green: "text-emerald-300",
  blue: "text-sky-300",
  amber: "text-orange-300",
  red: "text-destructive",
  neutral: "text-foreground",
};

function compact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

export const FlashStatusStrip = memo(function FlashStatusStrip({
  live, scheduled, endingSoon, revenueToday, ctr, conversion, health, confidence, onSelect,
}: {
  live: number;
  scheduled: number;
  endingSoon: number;
  revenueToday: number;
  ctr: number;
  conversion: number;
  health: number;
  /** 0–100 assistant confidence in its current recommendations. */
  confidence: number;
  onSelect: (key: StatusKey) => void;
}) {
  const cells: { key: StatusKey; label: string; value: string; icon: typeof Flame; tone: StatusTone }[] = [
    { key: "live", label: "Live", value: String(live), icon: Flame, tone: live > 0 ? "green" : "amber" },
    { key: "scheduled", label: "Scheduled", value: String(scheduled), icon: CalendarClock, tone: "blue" },
    { key: "ending", label: "Ending < 2h", value: String(endingSoon), icon: TimerReset, tone: endingSoon > 0 ? "amber" : "neutral" },
    { key: "revenue", label: "Revenue today", value: compact(revenueToday), icon: Wallet, tone: "neutral" },
    { key: "ctr", label: "CTR", value: `${ctr.toFixed(1)}%`, icon: MousePointerClick, tone: "neutral" },
    { key: "conversion", label: "Conversion", value: `${conversion.toFixed(1)}%`, icon: ShoppingBag, tone: "neutral" },
    { key: "health", label: "Health", value: String(health), icon: HeartPulse, tone: health >= 75 ? "green" : health >= 50 ? "amber" : "red" },
    { key: "confidence", label: "AI confidence", value: `${confidence}%`, icon: Sparkles, tone: confidence >= 70 ? "green" : confidence >= 40 ? "amber" : "neutral" },
  ];

  return (
    <div className="sticky top-0 z-30 -mx-1 bg-background/85 px-1 py-2 backdrop-blur-xl">
      <div
        role="group"
        aria-label="Flash deals status"
        className="grid grid-cols-4 gap-px overflow-hidden rounded-2xl border border-border bg-white/5 sm:grid-cols-8"
      >
        {cells.map((c) => {
          const Icon = c.icon;
          return (
            <button
              key={c.key}
              onClick={() => onSelect(c.key)}
              aria-label={`${c.label}: ${c.value}`}
              className="min-h-11 min-w-0 bg-card px-2 py-2 text-left transition hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
            >
              <span className="flex items-center gap-1">
                <Icon className={`size-3 shrink-0 ${TONE[c.tone]}`} aria-hidden />
                <span className="truncate text-[9px] font-mono uppercase tracking-[0.14em] text-muted-foreground">{c.label}</span>
              </span>
              <p className={`mt-0.5 truncate font-display text-base font-semibold tabular-nums ${TONE[c.tone]}`}>{c.value}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
});
