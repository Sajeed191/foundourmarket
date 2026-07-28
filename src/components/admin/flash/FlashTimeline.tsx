/**
 * Calendar timeline — Today / Tomorrow / This Week / Upcoming / Ended, with
 * visual duration bars, conflict marks and quick shift/resize controls.
 */
import { useMemo } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import type { DealEntry } from "@/lib/flash/use-flash-admin";

type Bucket = "today" | "tomorrow" | "week" | "upcoming" | "ended";
const ORDER: Bucket[] = ["today", "tomorrow", "week", "upcoming", "ended"];
const TITLE: Record<Bucket, string> = {
  today: "Today", tomorrow: "Tomorrow", week: "This week", upcoming: "Upcoming", ended: "Ended",
};

function bucketOf(e: DealEntry, now: number): Bucket | null {
  if (!e.deal) return null;
  const start = new Date(e.deal.start_at).getTime();
  const end = new Date(e.deal.end_at).getTime();
  if (end < now) return "ended";
  const day = 86400_000;
  const startOfDay = new Date(now).setHours(0, 0, 0, 0);
  if (start <= startOfDay + day) return "today";
  if (start <= startOfDay + 2 * day) return "tomorrow";
  if (start <= startOfDay + 7 * day) return "week";
  return "upcoming";
}

export function FlashTimeline({
  entries, now, onShift, onResize, onEdit,
}: {
  entries: DealEntry[];
  now: number;
  onShift: (e: DealEntry, hours: number) => void;
  onResize: (e: DealEntry, hours: number) => void;
  onEdit: (e: DealEntry) => void;
}) {
  const grouped = useMemo(() => {
    const g = new Map<Bucket, DealEntry[]>();
    for (const e of entries) {
      const b = bucketOf(e, now);
      if (!b) continue;
      const list = g.get(b) ?? [];
      list.push(e);
      g.set(b, list);
    }
    return g;
  }, [entries, now]);

  return (
    <div className="space-y-5">
      {ORDER.map((b) => {
        const list = grouped.get(b) ?? [];
        if (list.length === 0) return null;
        return (
          <section key={b} className="space-y-2">
            <h3 className="text-[11px] font-mono uppercase tracking-[0.3em] text-muted-foreground">
              {TITLE[b]} · {list.length}
            </h3>
            <div className="space-y-2">
              {list.map((e) => {
                const start = new Date(e.deal!.start_at).getTime();
                const end = new Date(e.deal!.end_at).getTime();
                const total = Math.max(1, end - start);
                const progress = Math.min(100, Math.max(0, ((now - start) / total) * 100));
                return (
                  <div key={e.key} className="rounded-2xl border border-border bg-card p-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => onEdit(e)} className="min-w-0 flex-1 text-left">
                        <p className="text-sm truncate">{e.product.name}</p>
                        <p className="text-[10px] font-mono text-muted-foreground">
                          {new Date(start).toLocaleString()} → {new Date(end).toLocaleString()}
                        </p>
                      </button>
                      {e.deal!.priority > 0 && (
                        <span className="rounded-full border border-accent/30 bg-accent/10 text-accent px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest">
                          P{e.deal!.priority}
                        </span>
                      )}
                      {e.warnings.includes("priority_conflict") && (
                        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-200 px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest">
                          conflict
                        </span>
                      )}
                    </div>

                    <div className="mt-2 h-2 rounded-full bg-white/5 overflow-hidden">
                      <div className="h-full rounded-full bg-accent/70" style={{ width: `${progress}%` }} />
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mr-1">move</span>
                      <button onClick={() => onShift(e, -6)} aria-label="Move 6 hours earlier"
                        className="size-11 grid place-items-center rounded-full border border-white/10 hover:bg-white/5"><ChevronLeft className="size-3.5" /></button>
                      <button onClick={() => onShift(e, 6)} aria-label="Move 6 hours later"
                        className="size-11 grid place-items-center rounded-full border border-white/10 hover:bg-white/5"><ChevronRight className="size-3.5" /></button>
                      <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mx-1">duration</span>
                      <button onClick={() => onResize(e, -6)} aria-label="Shorten by 6 hours"
                        className="size-11 grid place-items-center rounded-full border border-white/10 hover:bg-white/5"><Minus className="size-3.5" /></button>
                      <button onClick={() => onResize(e, 6)} aria-label="Extend by 6 hours"
                        className="size-11 grid place-items-center rounded-full border border-white/10 hover:bg-white/5"><Plus className="size-3.5" /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
      {grouped.size === 0 && (
        <p className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          No scheduled flash deals yet.
        </p>
      )}
    </div>
  );
}
