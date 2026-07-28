/**
 * Rotation heatmap — makes the existing 6-hour rotation legible at a glance:
 * current slot, next slot, visibility share and the estimated next appearance.
 * Reads simulated windows only; the rotation algorithm itself is untouched.
 */
import { memo } from "react";
import type { HeatRow } from "@/lib/flash/flash-autonomy";

function eta(ms: number | null) {
  if (ms == null) return "—";
  const mins = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(mins / 60);
  return h > 0 ? `${h}h ${mins % 60}m` : `${mins}m`;
}

function heat(pct: number) {
  if (pct >= 75) return "bg-accent";
  if (pct >= 45) return "bg-amber-400/80";
  if (pct >= 20) return "bg-sky-400/70";
  return "bg-white/15";
}

export const FlashRotationHeatmap = memo(function FlashRotationHeatmap({
  rows, limit = 12,
}: {
  rows: HeatRow[];
  limit?: number;
}) {
  if (rows.length === 0) {
    return <p className="rounded-2xl border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">
      No products are currently eligible for rotation.
    </p>;
  }

  return (
    <ul className="space-y-1.5">
      {rows.slice(0, limit).map((r) => (
        <li key={r.slug} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm">{r.name}</p>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/5">
              <div className={`h-full rounded-full ${heat(r.visibilityPct)}`} style={{ width: `${r.visibilityPct}%` }} />
            </div>
            <p className="mt-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              shown {r.shownToday} · skipped {r.skippedToday} · next in {eta(r.nextAppearanceMs)}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-sm font-semibold tabular-nums">{r.visibilityPct}%</p>
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground tabular-nums">
              slot {r.currentSlot != null ? r.currentSlot + 1 : "—"} → {r.nextSlot != null ? r.nextSlot + 1 : "—"}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
});
