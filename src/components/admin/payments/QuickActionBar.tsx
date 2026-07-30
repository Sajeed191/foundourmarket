import { CalendarClock, Clock, Download, Landmark, XCircle, RotateCcw } from "lucide-react";
import type { QuickCounts } from "@/lib/payments-center-v3.functions";

export type QuickKey = "today" | "pending" | "refunds" | "failed" | "settlements" | "exports";

const ITEMS: { key: QuickKey; label: string; icon: React.ReactNode }[] = [
  { key: "today", label: "Today's payments", icon: <CalendarClock className="size-3.5" /> },
  { key: "pending", label: "Pending", icon: <Clock className="size-3.5" /> },
  { key: "refunds", label: "Refund queue", icon: <RotateCcw className="size-3.5" /> },
  { key: "failed", label: "Failed", icon: <XCircle className="size-3.5" /> },
  { key: "settlements", label: "Settlements", icon: <Landmark className="size-3.5" /> },
  { key: "exports", label: "Exports", icon: <Download className="size-3.5" /> },
];

/** Sticky quick-action bar with live badge counts from real data. */
export function QuickActionBar({
  counts, active, onSelect,
}: { counts: QuickCounts; active: QuickKey | null; onSelect: (k: QuickKey) => void }) {
  const badge = (k: QuickKey): number | null => {
    switch (k) {
      case "today": return counts.today;
      case "pending": return counts.pending;
      case "refunds": return counts.refund_queue;
      case "failed": return counts.failed;
      case "settlements": return counts.settlements;
      default: return null;
    }
  };

  return (
    <div className="sticky top-0 z-20 -mx-1 px-1 py-2 backdrop-blur-xl bg-background/70 border-b border-white/5">
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
        {ITEMS.map((it) => {
          const n = badge(it.key);
          const on = active === it.key;
          return (
            <button
              key={it.key}
              onClick={() => onSelect(it.key)}
              className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-[11px] min-h-9 transition-colors ${
                on ? "border-accent/50 bg-accent/10 text-accent" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
              }`}
            >
              {it.icon}
              <span className="whitespace-nowrap">{it.label}</span>
              {n != null && (
                <span className={`rounded-full px-1.5 text-[10px] font-mono ${on ? "bg-accent/20" : "bg-white/10"}`}>{n}</span>
              )}
              {n == null && it.key === "settlements" && (
                <span className="rounded-full bg-white/10 px-1.5 text-[9px] font-mono uppercase">n/a</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
